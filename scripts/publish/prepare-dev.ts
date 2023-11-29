/* eslint node/no-unsupported-features/node-builtins: 0 */ // --> OFF
import fs from "fs"
import path from "path"
import fsExtra from "fs-extra"
import glob from 'glob'

// This file is used by build system to build a clean npm package with the solidity files, their abi, and the tooling to integrate with testing.
function main() {
  const rootDir = path.join(__dirname, "/../..")
  const scriptsDir = path.join(rootDir, "/scripts/publish")
  const libDir = path.join(rootDir, "/libDev")
  const libSrcDir = path.join(libDir, "/src")
  const abiDir = path.join(libDir, "/abi")

  const typechainDir = path.join(libSrcDir, "/typechain-types")
  const toolsDir = path.join(libSrcDir, "/tools")
  const utilsDir = path.join(libSrcDir, "/test/utils")

  const rootContracts = path.join(rootDir, "/contracts")
  const rootAbiDir = path.join(rootDir, "/artifacts/contracts")
  const rootTypechainDir = path.join(rootDir, "/typechain-types")
  const rootToolsDir = path.join(rootDir, "/tools")
  const rootUtilsDir = path.join(rootDir, "/test/utils")
  console.log(`Creating lib directory at ${libDir}`)
  if (fs.existsSync(libDir)) {
    fs.rmSync(libDir, {recursive: true})
  }
  fs.mkdirSync(libDir)

  if (!fs.existsSync(libSrcDir)) {
    fs.mkdirSync(libSrcDir)
  }
  
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir)
  }

  if (!fs.existsSync(typechainDir)) {
    fs.mkdirSync(typechainDir)
  }

  const source = fs.readFileSync(rootDir + "/package.json").toString("utf-8")
  const sourceObj = JSON.parse(source)

  delete sourceObj.scripts
  delete sourceObj.files
  delete sourceObj.devDependencies
  //Change package name
  sourceObj.name = `${sourceObj.name}-dev`

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

  fs.copyFile(
    path.join(scriptsDir, "/tsup.config.ts"),
    path.join(libDir, "/tsup.config.ts"),
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

    console.log('Contract copy completed!')
  })


  // Move the contact abis to the lib
  glob(rootAbiDir + '/**/*.json', {}, (err, files) => {
    const abiFiles = files.filter((filePath) => filePath.indexOf('dbg') == -1)
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

  // Move the typechain types
  fsExtra.copy(rootTypechainDir, typechainDir, function (err) {
    if (err) {
      console.log('An error occured while copying the folder.')
      return console.error(err)
    }
    console.log('Typechain types copy completed!')
  })

  // Move the tools for deployment
  fsExtra.copy(rootToolsDir, toolsDir, function (err) {
    if (err) {
      console.log('An error occured while copying the folder.')
      return console.error(err)
    }
    console.log('Tooling script copy completed!')
  })

  // Move the utils for test
  fsExtra.copy(rootUtilsDir, utilsDir, function (err) {
    if (err) {
      console.log('An error occured while copying the folder.')
      return console.error(err)
    }
    console.log('Test util copy completed!')
  })

  fs.writeFileSync(path.join(libSrcDir, '/index.ts'), `export * from './typechain-types'\nexport * from './test/utils'\n`);
}

main()
