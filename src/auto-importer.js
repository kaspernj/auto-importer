/* eslint no-await-in-loop: "off", no-cond-assign: "off", no-continue: "off", no-useless-escape: "off" */

import {exec} from "child_process"
import {promises as fs} from "fs"

const imports = {}

exec("yarn eslint", null, async (_stdout, stderr) => { // eslint-disable-line complexity
  const fileMatches = stderr.matchAll(/\/home\/dev\/Development\/gratisbyggetilbud_rails\/(.+)\n([\s\S]+?)\n\n/g)

  for (const fileMatch of fileMatches) {
    const filePath = fileMatch[1]
    const errors = fileMatch[2]
    const errorMatches = errors.matchAll(/error\s+'(.+)' is not defined\s+(no-undef|react\/jsx-no-undef|react\/react-in-jsx-scope)/g)

    console.log(filePath)

    if (filePath.match(/\.jsx$/)) {
      console.log("is React!")

      const reactProvidePath = "react"

      if (!(filePath in imports)) imports[filePath] = {}
      if (!(reactProvidePath in imports[filePath])) {
        imports[filePath][reactProvidePath] = {
          defaultImport: "React",
          modelClassRequire: [],
          multiple: []
        }
      }
    } else {
      console.log("is not React!")
    }

    for (const errorMatch of errorMatches) {
      const constant = errorMatch[1]
      const provide = provides[constant]
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
        console.log(`No provide path for ${constant}`)
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
          if (provide.length == 2) {
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
            console.log({provide})

            throw new Error(`Unsupported length: ${provide.length}`)
          }
        } else {
          imports[filePath][providePath].defaultImport = constant
        }
      }
    }
  }

  // console.log(imports)

  for (const filePath in imports) {
    const fileContentBuffer = await fs.readFile(filePath)
    const fileLines = fileContentBuffer.toString().split("\n")
    const restLines = []
    let match

    for (const fileLine of fileLines) {
      if (match = fileLine.match(/^\s*import (.+?) from \"(.+)\"/)) { // Line is an import
        // console.log({match})

        const importConstant = match[1]
        const providePath = match[2]
        const multipleMatch = importConstant.match(/^\{(.+)\}$/)
        const importData = imports[filePath][providePath] || {
          defaultImport: null,
          modelClassRequire: [],
          multiple: []
        }

        if (multipleMatch) {
          const constants = multipleMatch[1].split(/\s*,\s*/)

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
        if (providePath1.toLowerCase() < providePath2.toLowerCase()) {
          // console.log(`${providePath1} before ${providePath2}`)
          return -1
        } else if (providePath1.toLowerCase() > providePath2.toLowerCase()) {
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

    console.log("Updating", filePath)
    await fs.writeFile(filePath, totalContent)
  }
})
