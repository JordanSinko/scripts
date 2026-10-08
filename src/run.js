import { commands } from './commands/index.js';

// Loads a command module and runs it, turning thrown errors into a clean exit.
export async function runCommand(name, argv) {
  const load = commands[name];
  if (!load) {
    console.error(`Unknown command: ${name}\n`);
    printCommandList(console.error);
    process.exitCode = 1;
    return;
  }

  try {
    const mod = await load();
    const code = await mod.run(argv);
    if (typeof code === 'number') process.exitCode = code;
  } catch (err) {
    console.error(`${name}: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exitCode = 1;
  }
}

export function printCommandList(log = console.log) {
  log('Available commands:');
  for (const name of Object.keys(commands)) log(`  ${name}`);
}
