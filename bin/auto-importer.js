#!/usr/bin/env node

import AutoImporter from "../src/auto-importer.js"

const processArgs = process.argv.slice(2)
const args = {}

for (let i = 0; i < processArgs.length; i++) {
  const arg = processArgs[i]

  if (arg == "--help" || arg == "-h") {
    console.log("Usage: libraries-watcher [options]")
    console.log("Options:")
    console.log("--help, -h: Show this help message")
    console.log("--config, -c: Path to the config file")

    exit()
  } else if (arg == "--config" || arg == "-c") {
    const configPath = processArgs[++i]

    console.log(`Using config file ${configPath}`)

    args.config = configPath
  } else {
    throw new Error(`Unknown argument ${arg}`)
  }
}

if (!args.config) throw new Error("No config file specified")

const provides = await require(args.config).default
const autoImporter = new AutoImporter({provides})

await autoImporter.run()
