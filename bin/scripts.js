#!/usr/bin/env node
// Dispatcher: `npx github:<owner>/scripts <command> [args]`
import { runCommand, printCommandList } from '../src/run.js';

const [name, ...rest] = process.argv.slice(2);

if (!name || name === '-h' || name === '--help') {
  console.log('Usage: scripts <command> [args]\n');
  printCommandList();
} else {
  await runCommand(name, rest);
}
