/* eslint node/no-unsupported-features/node-builtins: 0 */ // --> OFF
import fs from "fs"
import path from "path"
import fsExtra from "fs-extra"

// This file is used by create the libarary for test contracts
function main() {
  const rootDir = path.join(__dirname, "/../..")
  const scriptsDir = path.join(rootDir, "/scripts/publish")
  const libDir = path.join(rootDir, "/libTest")
  const rootTestContracts = path.join(rootDir, "/contracts/test")
  console.log(`Creating lib directory at ${libDir}`)
  if (fs.existsSync(libDir)) {
    fs.rmSync(libDir, {recursive: true})
  }
  fs.mkdirSync(libDir)

  const source = fs.readFileSync(rootDir + "/package.json").toString("utf-8")
  const sourceObj = JSON.parse(source)

  delete sourceObj.scripts
  delete sourceObj.files
  delete sourceObj.devDependencies
  //Change package name
  sourceObj.name = `${sourceObj.name}-test`

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

  const contractsTestDir = path.join(libDir, "/contracts/test")
  if (!fs.existsSync(contractsTestDir)) {
    fs.mkdirSync(contractsTestDir, {recursive: true})
  }

  // Move the contracts to the lib
  fsExtra.copy(rootTestContracts, contractsTestDir, function (err) {
    if (err) {
      console.log('An error occured while copying the folder.')
      return console.error(err)
    }

    console.log('Contract copy completed!')
  })

}

main()
