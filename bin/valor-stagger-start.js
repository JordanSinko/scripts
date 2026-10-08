#!/usr/bin/env node
import { runCommand } from '../src/run.js';

await runCommand('valor-stagger-start', process.argv.slice(2));
