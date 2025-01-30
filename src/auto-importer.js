/* eslint no-await-in-loop: "off", no-cond-assign: "off", no-continue: "off", no-useless-escape: "off" */

import {exec} from "child_process"
import {promises as fs} from "fs"
import regexEscape from "regex-escape"

export default class AutoImporter {
  constructor({dryRun, path, provides, verbose, ...restProps}) {
    const restPropsKeys = Object.keys(restProps)

    if (restPropsKeys.length > 0) {
      throw new Error(`AutoImporter: Invalid props ${restPropsKeys}`)
    }

    this.dryRun = dryRun
    this.path = path || process.cwd()
    this.provides = provides
    this.verbose = verbose
  }

  runEslint() {
    return new Promise((resolve, reject) => {
      if (this.verbose) console.log("Running Eslint")

      exec("yarn eslint", {cwd: this.path}, (error, stdout, stderr) => {
        //if (error) console.log("Error", error)
        //if (stderr) console.log("Stderr", stderr)
        if (this.verbose) console.log("Succeeding Eslint")

        resolve(stdout)
      })
    })
  }

  async run() {
    const imports = {}
    const stdout = await this.runEslint()
    const regExp = new RegExp(`${regexEscape(this.path)}\/(.+)\\n([\\s\\S]+?)\\n\\n`, "g")
    const fileMatches = stdout.matchAll(regExp)

    for (const fileMatch of fileMatches) {
      const filePath = fileMatch[1]
      const errors = fileMatch[2]
      const errorMatches = [...errors.matchAll(/error\s+'(.+)'\s+(.+)\s+(no-undef|react\/jsx-no-undef|react\/react-in-jsx-scope)/g)]
      const sortImportsMatches = [...errors.matchAll(/error\s+(.+?)\s+sort-import/g)]

      if (sortImportsMatches.length > 0) {
        if (!(filePath in imports)) {
          imports[filePath] = {}
        }
      }

      if (this.verbose) console.log(`Found file: ${filePath} with ${errorMatches.length} error matches and ${sortImportsMatches.length} sort imports`)

      for (const errorMatch of errorMatches) {
        const constant = errorMatch[1]
        const provide = this.provides[constant]
        let providePath

        if (provide === undefined) {
          // Do nothing
        } else if (Array.isArray(provide)) {
          providePath = provide[0]
        } else if (typeof provide == "string") {
          providePath = provide
        } else {
          throw new Error(`Unknown type of provide: ${typeof provide}`)
        }

        if (!providePath) {
          if (this.verbose) console.log(`No provide path for ${constant}`)
        } else {
          // console.log(`Can provide with ${providePath}`)

          if (!(filePath in imports)) imports[filePath] = {}
          if (!(providePath in imports[filePath])) {
            imports[filePath][providePath] = {
              defaultImport: null,
              modelClassRequire: [],
              multiple: []
            }
          }

          if (Array.isArray(provide)) {
            if (provide.length == 1) {
              imports[filePath][providePath].defaultImport = constant
            } else if (provide.length == 2) {
              if (provide[1] == "default") {
                imports[filePath][providePath].defaultImport = constant
              } else if (!imports[filePath][providePath].multiple.includes(constant)) {
                imports[filePath][providePath].multiple.push(constant)
              }
            } else if (provide.length == 3) {
              imports[filePath][providePath].defaultImport = "models"

              if (!imports[filePath][providePath].modelClassRequire.includes(constant)) {
                imports[filePath][providePath].modelClassRequire.push(constant)
              }
            } else {
              throw new Error(`Unsupported length ${provide.length} for ${constant}`)
            }
          } else {
            imports[filePath][providePath].defaultImport = constant
          }
        }
      }
    }

    for (const filePath in imports) {
      const fileContentBuffer = await fs.readFile(`${this.path}/${filePath}`)
      const fileLines = fileContentBuffer.toString().split("\n")
      const restLines = []
      let match

      for (const fileLine of fileLines) {
        if (match = fileLine.match(/^\s*import (.+?) from \"(.+)\"/)) { // Line is an import
          const importConstant = match[1]
          const providePath = match[2]
          const multipleMatch = importConstant.match(/^((.+),\s*|)\{(.+)\}$/)
          const importData = imports[filePath][providePath] || {
            defaultImport: null,
            modelClassRequire: [],
            multiple: []
          }

          if (multipleMatch) {
            const defaultImport = multipleMatch[2]
            const constants = multipleMatch[3].split(/\s*,\s*/)

            if (defaultImport) {
              importData.defaultImport = defaultImport
            }

            if (constants.length == 0) throw new Error(`No constants found in ${importConstant}`)

            for (const constant of constants) {
              if (!importData.multiple.includes(constant)) {
                importData.multiple.push(constant)
              }
            }
          } else {
            importData.defaultImport = importConstant
          }

          imports[filePath][providePath] = importData

          continue
        } else {
          restLines.push(fileLine)
        }
      }

      const providePaths = Object.keys(imports[filePath]).sort((providePath1, providePath2) => {
        // console.log("Sort", providePath1, providePath2)

        const import1 = imports[filePath][providePath1]
        const import2 = imports[filePath][providePath2]

        const defaultImport1 = (import1.defaultImport || import1.multiple[0])?.toLowerCase()
        const defaultImport2 = (import2.defaultImport || import2.multiple[0])?.toLowerCase()

        let total1 = import1.multiple.length
        let total2 = import2.multiple.length

        if (import1.defaultImport) total1++
        if (import2.defaultImport) total2++

        // console.log({providePath1, total1, import1, providePath2, total2, import2})

        if (total1 >= 2 && total2 <= 1) {
          // console.log(`${providePath1} before ${providePath2} because more total in 1 (${total1}, ${total2})`)
          return -1
        } else if (total1 <= 1 && total2 >= 2) {
          // console.log(`${providePath2} before ${providePath1} because more total in 2 (${total1}, ${total2})`)
          return 1
        } else if (total1 >= 2 && total2 >= 2) {
          if (defaultImport1.toLowerCase() < defaultImport2.toLowerCase()) {
            // console.log(`${providePath1} before ${providePath2}`)
            return -1
          } else if (defaultImport1.toLowerCase() > defaultImport2.toLowerCase()) {
            // console.log(`${providePath2} before ${providePath1}`)
            return 1
          }
          // console.log(`Same provide path? ${providePath1} ${providePath2}`)
        } else if (defaultImport1 < defaultImport2) {
          // console.log(`${defaultImport1} before ${defaultImport2}`)
          return -1
        } else if (defaultImport1 > defaultImport2) {
          // console.log(`${defaultImport2} before ${defaultImport1}`)
          return 1
        }

        // console.log(`Equal ${providePath1}, ${providePath2}`)
        return 0
      })

      const importStatements = []
      const modelClassRequires = []

      for (const providePath of providePaths) {
        const importData = imports[filePath][providePath]

        if (importData.modelClassRequire) {
          for (const modelClassRequire of importData.modelClassRequire) {
            modelClassRequires.push(modelClassRequire)
          }
        }

        let importStatement = "import "

        if (importData.defaultImport) {
          importStatement += importData.defaultImport
        }

        if (importData.multiple.length > 0) {
          if (importData.defaultImport) importStatement += ", "

          importStatement += "{"

          for (const constantIndex in importData.multiple.sort()) {
            if (constantIndex > 0) importStatement += ", "

            importStatement += importData.multiple[constantIndex]
          }

          importStatement += "}"
        }

        importStatement += ` from "${providePath}"`

        importStatements.push(importStatement)
      }

      let modelClassRequireContent = ""

      if (modelClassRequires.length > 0) {
        modelClassRequireContent += `\nconst {${modelClassRequires.join(", ")}} = models\n`
      }

      const importStatementsContent = importStatements.join("\n")
      const restContent = restLines.join("\n")
      const totalContent = `${importStatementsContent}\n${modelClassRequireContent}${restContent}`

      if (this.dryRun) {
        console.log(`Would like to update ${filePath} with the following imports:`)
        console.log(`${importStatementsContent}\n`)
      } else {
        console.log(`Updating ${filePath}`)
        await fs.writeFile(`${this.path}/${filePath}`, totalContent)
      }
    }
  }
}
