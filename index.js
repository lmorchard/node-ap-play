#!/usr/bin/env node
import { Command } from "commander";

import { init as initConfig } from "./lib/config.js";
import initServer from "./commands/server.js";

const program = new Command();
const context = { program };
[initConfig, initServer].forEach((fn) => fn(context));

async function main() {
  await program.parseAsync(process.argv);
}

main().catch((err) => console.error(err));
