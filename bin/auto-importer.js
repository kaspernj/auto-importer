#!/usr/bin/env node

import AutoImporter from "../src/auto-importer.js"
import fs from "fs"

const processArgs = process.argv.slice(2)
const args = {}

for (let i = 0; i < processArgs.length; i++) {
  const arg = processArgs[i]

  if (arg == "--help" || arg == "-h") {
    console.log("Usage: libraries-watcher [options]")
    console.log("Options:")
    console.log("--help, -h: Show this help message")
    console.log("--config, -c: Path to the config file")
    console.log("--dry-run: Don't actually import anything, just print what would be imported")
    console.log("--path, -p: Path to the directory to watch for changes")
    console.log("--verbose, -v: Print more information about what's going on")

    exit()
  } else if (arg == "--config" || arg == "-c") {
    args.config = processArgs[++i]
  } else if (arg == "--dry-run") {
    args.dryRun = true
  } else if (arg == "--path" || arg == "-p") {
    args.path = processArgs[++i]
  } else if (arg == "--verbose" || arg == "-v") {
    args.verbose = true
  } else {
    throw new Error(`Unknown argument ${arg}`)
  }
}

if (!args.config) throw new Error("No config file specified")

const path = args.path || process.cwd()
let configPath

if (args.config.startsWith("/")) {
  configPath = args.config
} else {
  configPath = `${path}/${args.config}`
}

if (!fs.existsSync(configPath)) throw new Error(`Config file ${configPath} does not exist`)
if (args.verbose) console.log(`Using config file ${configPath}`)
if (args.verbose) console.log(`Watching for changes in ${path}`)
if (args.verbose) console.log(`Dry run mode is ${args.dryRun ? "on" : "off"}`)

const providesImport = await import(configPath)
const provides = providesImport?.default

if (!provides) throw new Error("No default export in config file")

const autoImporter = new AutoImporter({
  dryRun: args.dryRun,
  path: args.path,
  provides,
  verbose: args.verbose
})

await autoImporter.run()
