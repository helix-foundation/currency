const assert = require('assert');
const { exec, execSync, ChildProcess } = require('child_process');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.prettyPrint(),
  ),
  transports: [
    new winston.transports.File({ filename: `${__dirname}/../log/supervisor.log`, level: 'info' }),
    new winston.transports.Console(),
  ],
});
const vdfProcessManager = {};
const REVEAL = 'reveal';
const ENTROPY = 'entropy';

const vdfFilePath = 'npx vdf-solver';

function existRunningVDFProc(node, address, type) {
  return !vdfProcessManager[[node, address, type]] === undefined;
}

function getRunningVDFProc(node, address, type) {
  if (existRunningVDFProc(node, address, type)) {
    const proc = vdfProcessManager[[node, address, type]];
    return proc;
  }
  return undefined;
}

function setRunningVDFProc(node, address, type, vdfProcess) {
  if (vdfProcess instanceof ChildProcess) {
    vdfProcessManager[[node, address, type]] = vdfProcess;
    return;
  }
  logger.warn('Only ChildProcess might be set');
}

function killVDFCalculation(node, address, type) {
  const proc = getRunningVDFProc(node, address, type);
  if (!proc) {
    return;
  }
  logger.info('Kill VDF calculation');
  proc.kill('SIGINT');
  delete vdfProcessManager[[node, address, type]];
}

async function awaitAllVDFEnded() {
  logger.warn('this function might run very long time, depends on VDF difficulty');
  logger.info('await to all processes to finish no running VDF calculation to kill');
  while (Object.keys(vdfProcessManager).length) {
    logger.info('VDF running, sleeping 1 second');
    // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
    await new Promise((done) => setTimeout(done, 1000));
  }
}

function spawnVDFSolver(seed, difficulty, n, node, address, vdfType, callback) {
  const cmd = `${vdfFilePath} --x ${seed} --t ${difficulty} --n ${n}`;
  const proc = exec(cmd, async (err, stdout, stderr) => {
    if (err) {
      logger.info(`ERROR during VDF computation flow. stderr: ${stderr}`);
      delete vdfProcessManager[[node, address, vdfType]];
      return;
    }
    const [key, proof] = JSON.parse(stdout);
    delete vdfProcessManager[[node, address, vdfType]];
    callback(key, proof);
  });
  setRunningVDFProc(node, address, vdfType, proc);
}

function testVDFSolver() {
  const cmd = `${vdfFilePath} --x 2 --t 3 --n 123`;
  const proc = execSync(cmd);
  assert.deepEqual(proc.toString(), '["37",["100","16"]]\n', 'VDF Solver failure');
}

module.exports = {
  killVDFCalculation,
  spawnVDFSolver,
  existRunningVDFProc,
  testVDFSolver,
  awaitAllVDFEnded,
  REVEAL,
  ENTROPY,
};
