/* eslint node/no-unsupported-features/node-builtins: 0 */ // --> OFF
import fs from "fs"
import path from "path"
import fsExtra from "fs-extra"
import glob from 'glob'

// This file is used by build system to build a clean npm package with the solidity files and their abi.
function main() {
  const rootDir = path.join(__dirname, "/../..")
  const libDir = path.join(rootDir, "/lib")
  const abiDir = path.join(libDir, "/abi")
  const utilsDir = path.join(libDir, "/utils")
  const typechainDir = path.join(libDir, "/typechain-types")
  const rootContracts = path.join(rootDir, "/contracts")
  const rootUtils = path.join(rootDir, "/test/utils")
  const rootAbiDir = path.join(rootDir, "/artifacts/contracts")
  const rootTypechainDir = path.join(rootDir, "/typechain-types")
  console.log(`Creating lib directory at ${libDir}`)
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir)
  }

  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir)
  }

  if (!fs.existsSync(utilsDir)) {
    fs.mkdirSync(utilsDir)
  }

  const source = fs.readFileSync(rootDir + "/package.json").toString("utf-8")
  const sourceObj = JSON.parse(source)

  delete sourceObj.scripts
  delete sourceObj.files
  delete sourceObj.devDependencies

  fs.copyFile(
    path.join(rootDir, "/LICENSE"),
    path.join(libDir, "/LICENSE"),
    function (err: any) {
      if (err) {
        return console.log(err)
      }
      console.log("Copy LICENSE")
    }
  )

  fs.writeFile(
    path.join(libDir, "/package.json"),
    Buffer.from(JSON.stringify(sourceObj, null, 2), "utf-8"),
    function (err: any) {
      if (err) {
        return console.log(err)
      }
      console.log("Copy lib package.json")
    }
  )

  const contractsDir = path.join(libDir, "/contracts")
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir)
  }

  // Move the contracts to the lib
  fsExtra.copy(rootContracts, contractsDir, function (err) {
    if (err) {
      console.log('An error occured while copying the folder.')
      return console.error(err)
    }
    const testDir = path.join(contractsDir, "/test")
    fs.rmSync(testDir, { recursive: true, force: true })

    console.log('Contract copy completed!')
  })


  // Move the contact abis to the lib
  glob(rootAbiDir + '/**/*.json', {}, (err, files) => {
    const abiFiles = files.filter((filePath) => filePath.indexOf('dbg') == -1 && filePath.indexOf('test') == -1)
    abiFiles.forEach((json, i) => {
      path.basename(json)
      fs.copyFile(
        json,
        path.join(abiDir, '/' + path.basename(json)),
        function (err: any) {
          if (err) {
            return console.log(err)
          }
        }
      )
    })
    console.log('Abi copy completed!')
  })

  // Move the tools to the lib
  fsExtra.copy(rootUtils, utilsDir, function (err) {
    if (err) {
      console.log('An error occured while copying the folder.')
      return console.error(err)
    }
    console.log('Utils copy completed!')
  })

  // Move the typechain types
  fsExtra.copy(rootTypechainDir, typechainDir, function (err) {
    if (err) {
      console.log('An error occured while copying the folder.')
      return console.error(err)
    }
    const openzeppelinDir0 = path.join(typechainDir, "/@openzeppelin")
    const openzeppelinDir1 = path.join(typechainDir, "/factories/@openzeppelin")
    const testDir0 = path.join(typechainDir, "/factories/contracts/test")
    const testDir1 = path.join(typechainDir, "/contracts/test")
    fs.rmSync(openzeppelinDir0, { recursive: true, force: true })
    fs.rmSync(openzeppelinDir1, { recursive: true, force: true })
    fs.rmSync(testDir0, { recursive: true, force: true })
    fs.rmSync(testDir1, { recursive: true, force: true })
    console.log('Typechain types copy completed!')
  })
}

main()
