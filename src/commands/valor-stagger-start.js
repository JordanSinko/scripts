import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { CancelledError, createPrompter } from '../lib/prompt.js';
import { backupAndWrite, defaultTasksPath, isValorRunning } from '../valor/system.js';
import {
  applyStagger,
  collectLists,
  parseInterval,
  parseLocalDateTime,
  parseSelection,
  parseTasksJson,
  serializeLike,
} from '../valor/tasks.js';

export const description = 'Stagger startScheduleTime across selected Valor task lists';

const usage = `Usage: valor-stagger-start [options]

${description}

Options:
  --file <path>  Path to Valor's tasks.json (default: the standard location)
  --dry-run      Print what would happen without doing it
  -h, --help     Show this help`;

const pad = (n, width = 2) => String(n).padStart(width, '0');
const dateOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clockOf = (d) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;

async function loadTasks(filePath) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read ${filePath}: ${err.message}. Use --file to point at tasks.json.`);
  }
  try {
    return { text, data: parseTasksJson(text) };
  } catch (err) {
    throw new Error(`${filePath} is not valid JSON: ${err.message}`);
  }
}

function printMenu(lists) {
  const width = Math.max(...lists.map((l) => l.label.length));
  lists.forEach((l, i) => {
    const n = l.taskIds.length;
    console.log(`  ${i + 1}) ${l.label.padEnd(width)}   (${n} task${n === 1 ? '' : 's'})`);
  });
}

function printPreview(changes, selected, startMs) {
  const startDate = dateOf(new Date(startMs));
  const line = ({ list, time }, index) => {
    const d = new Date(time);
    const day = dateOf(d) === startDate ? '' : `${dateOf(d)} `;
    return `  #${index + 1}  ${list.label}  ${day}${clockOf(d)}`;
  };
  console.log(`\n${changes.length} tasks across ${selected.length} list${selected.length === 1 ? '' : 's'}:`);
  if (changes.length <= 6) {
    changes.forEach((c, i) => console.log(line(c, i)));
  } else {
    for (let i = 0; i < 3; i++) console.log(line(changes[i], i));
    console.log('  ...');
    for (let i = changes.length - 3; i < changes.length; i++) console.log(line(changes[i], i));
  }
  if (startMs < Date.now()) console.log('⚠ Start time is in the past.');
}

export async function run(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      file: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(usage);
    return 0;
  }

  const filePath = values.file ?? defaultTasksPath();
  const { text, data } = await loadTasks(filePath);
  console.log(`Using ${filePath}`);

  const lists = collectLists(data);
  if (lists.length === 0) {
    console.log('No task lists found. Nothing to do.');
    return 0;
  }
  printMenu(lists);

  const prompter = createPrompter();
  try {
    const picked = await prompter.ask('Select lists (e.g. 1,2 or 1-2 or all):', (s) =>
      parseSelection(s, lists.length),
    );
    const selected = picked.map((i) => lists[i]);
    if (selected.every((l) => l.taskIds.length === 0)) {
      console.log('Selected lists have no tasks. Nothing to do.');
      return 0;
    }

    const startMs = await prompter.ask(
      'Start time (YYYY-MM-DD HH:MM[:SS[.mmm]], local):',
      parseLocalDateTime,
    );
    const intervalMs = await prompter.ask('Interval between tasks (ms):', parseInterval);

    const changes = applyStagger(data, selected, startMs, intervalMs);
    printPreview(changes, selected, startMs);

    if (values['dry-run']) {
      console.log('Dry run: no changes written.');
      return 0;
    }

    if (await isValorRunning()) {
      console.log('⚠ Valor appears to be running; quit it first or it may overwrite this file.');
    }
    const answer = await prompter.ask('Write changes? (y/N):', (s) => s.trim().toLowerCase());
    if (answer !== 'y' && answer !== 'yes') return 0;

    const backupPath = await backupAndWrite(filePath, serializeLike(text, data));
    console.log(`Backup: ${backupPath}`);
    console.log(`Updated ${changes.length} tasks.`);
    return 0;
  } catch (err) {
    if (err instanceof CancelledError) {
      console.log('\nCancelled.');
      return 130;
    }
    throw err;
  } finally {
    prompter.close();
  }
}
