// Verifies that package.json bins, bin/ shims, and the command registry agree.
import { readFile, access } from 'node:fs/promises';
import { commands } from '../src/commands/index.js';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const dispatcher = pkg.name;
const problems = [];

for (const [name, file] of Object.entries(pkg.bin)) {
  try {
    await access(new URL(`../${file}`, import.meta.url));
  } catch {
    problems.push(`bin "${name}" points to missing file ${file}`);
  }
  if (name !== dispatcher && !commands[name]) {
    problems.push(`bin "${name}" is not registered in src/commands/index.js`);
  }
}

for (const [name, load] of Object.entries(commands)) {
  if (!pkg.bin[name]) problems.push(`command "${name}" has no bin entry in package.json`);
  const mod = await load();
  if (typeof mod.run !== 'function') problems.push(`command "${name}" does not export run()`);
}

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ ${Object.keys(commands).length} command(s) wired up`);
