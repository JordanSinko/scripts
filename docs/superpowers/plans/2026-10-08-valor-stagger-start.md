# valor-stagger-start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `valor-stagger-start` placeholder with an interactive command that re-spaces `startScheduleTime` across one or more selected Valor task lists, treated as one combined sequence.

**Architecture:** Pure data logic lives in `src/valor/tasks.js`, OS concerns (path, process check, atomic write) in `src/valor/system.js`, and a reusable readline prompter in `src/lib/prompt.js`. `src/commands/valor-stagger-start.js` orchestrates them. Unit tests cover the pure modules. One end-to-end test spawns the bin with piped stdin.

**Tech Stack:** Node ≥ 20, ESM, built-ins only (`node:util` parseArgs, `node:readline`, `node:fs/promises`, `node:child_process`, `node:test`).

**Spec:** `docs/superpowers/specs/2026-10-08-valor-stagger-start-design.md`

## Global Constraints

- No runtime or dev dependencies. No build step. Files run as they sit in the repo.
- Node `>=20` (already in `package.json` engines).
- Default paths: macOS `~/Library/Application Support/valor3/tasks.json`; Windows `%APPDATA%\valor3\tasks.json`.
- Start time and interval are always prompted, with no defaults and no flags. The only flags are `--file <path>`, `--dry-run`, and `-h/--help`.
- Only `startScheduleTime` is changed. Key order, all other values, indentation and the trailing newline are preserved.
- Commands keep the existing contract: `export async function run(argv)` returns an exit code, and thrown errors are printed by `src/run.js`.
- `npm run check` must keep passing.

## Review Focus

1. **Lines piped in all at once** (scripts, the e2e test, pasting several answers): `readline/promises` `question()` drops lines that arrive before it is called. The prompter must queue lines itself. Pinned by the prompter test `answers buffered before ask are not lost` (Task 2) and by the e2e test (Task 3).
2. **Ctrl-C at a prompt:** if `rl` has no `'SIGINT'` listener, readline only pauses and the process hangs. The prompter must reject with `CancelledError`, and the command must print `Cancelled.` and return 130 without writing. Pinned by `SIGINT rejects with CancelledError` (Task 2).
3. **UTF-8 BOM at the start of tasks.json** (common for files written on Windows): `JSON.parse` throws on it. Strip it on read and write it back on save. Pinned by `serializeLike preserves BOM and trailing newline` (Task 1).
4. **Selection typed loosely:** `" 2 , 1 "` must work, and a reversed range `"3-1"` must be rejected with a clear message instead of selecting nothing. Pinned in `parseSelection` tests (Task 1).
5. **Windows with `APPDATA` unset,** or an unsupported platform: the error must ask for `--file` instead of building a path like `undefined\valor3\tasks.json`. Pinned by `defaultTasksPath` tests (Task 2).

---

### Task 1: Pure task logic (`src/valor/tasks.js`) and test runner

**Files:**
- Create: `src/valor/tasks.js`
- Create: `test/valor-tasks.test.js`
- Modify: `package.json` (add `"test": "node --test"` to `scripts`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `collectLists(data) -> Array<{ groupId: string, mode: string, label: string, taskIds: string[] }>`. JSON order. `label` is `` `${data.groups?.[groupId]?.name ?? groupId} / ${mode}` ``. Throws `Error('tasks.json has no "lists" object')` if `data?.lists` is not a plain object.
  - `parseSelection(input: string, count: number) -> number[]`. Returns 0-based indexes in the order typed, deduplicated with the first occurrence kept. Throws an `Error` with a user-facing message on bad input.
  - `parseLocalDateTime(input: string) -> number`. Takes `YYYY-MM-DD HH:MM[:SS[.mmm]]`, trims, and returns epoch ms in local time. Throws on malformed or impossible values.
  - `parseInterval(input: string) -> number`. Accepts `/^\d+$/` after trim, otherwise throws `Error('Enter a whole number of milliseconds (0 or more)')`.
  - `applyStagger(data, lists, startMs: number, intervalMs: number) -> Array<{ list, taskId: string, time: number }>`. Mutates `data.lists[groupId][mode][taskId].startScheduleTime`.
  - `parseTasksJson(text: string) -> object`. Strips a leading `\uFEFF` and then calls `JSON.parse`.
  - `serializeLike(originalText: string, data) -> string`. Uses the BOM, indent (via `detectIndent`) and trailing newline of `originalText`.
  - `detectIndent(text: string) -> number | '\t'`. Uses the leading whitespace of the first line that starts with whitespace followed by `"`. Returns `'\t'` for a tab, the space count for spaces, and `0` if no such line exists (minified).

- [ ] **Step 1: Add `"test": "node --test"` to `package.json` scripts, then write `test/valor-tasks.test.js` with `node:test` and `node:assert/strict`:**

```js
test('parseSelection', () => {
  assert.deepEqual(parseSelection('2,1', 3), [1, 0]);
  assert.deepEqual(parseSelection(' 2 , 1 ', 3), [1, 0]);
  assert.deepEqual(parseSelection('1-3', 3), [0, 1, 2]);
  assert.deepEqual(parseSelection('3,1-2', 3), [2, 0, 1]);
  assert.deepEqual(parseSelection('ALL', 3), [0, 1, 2]);
  assert.deepEqual(parseSelection('1,1,2', 3), [0, 1]);
  for (const bad of ['', '0', '4', '3-1', '1-', 'a', '1,,2', '1.5'])
    assert.throws(() => parseSelection(bad, 3), Error, bad);
});

test('parseLocalDateTime', () => {
  assert.equal(parseLocalDateTime('2026-10-09 10:00'), new Date(2026, 9, 9, 10, 0).getTime());
  assert.equal(parseLocalDateTime(' 2026-10-09 10:00:05 '), new Date(2026, 9, 9, 10, 0, 5).getTime());
  assert.equal(parseLocalDateTime('2026-10-09 10:00:05.250'), new Date(2026, 9, 9, 10, 0, 5, 250).getTime());
  for (const bad of ['2026-02-30 10:00', '2026-10-09 25:00', '2026-10-09 10:60', '2026-10-09', 'tomorrow', '2026-10-09T10:00', '2026-10-09 10:00:05.25'])
    assert.throws(() => parseLocalDateTime(bad), Error, bad);
});

test('parseInterval', () => {
  assert.equal(parseInterval('250'), 250);
  assert.equal(parseInterval(' 0 '), 0);
  for (const bad of ['', '-1', '1.5', '1e3', '250ms']) assert.throws(() => parseInterval(bad), Error, bad);
});

test('collectLists labels and order, missing-group fallback', () => {
  const data = { groups: { g1: { name: 'Pokemon' } }, lists: {
    g1: { Default: { a: {}, b: {} }, Restock: { c: {} } },
    g2: { Default: {} },
  } };
  assert.deepEqual(collectLists(data), [
    { groupId: 'g1', mode: 'Default', label: 'Pokemon / Default', taskIds: ['a', 'b'] },
    { groupId: 'g1', mode: 'Restock', label: 'Pokemon / Restock', taskIds: ['c'] },
    { groupId: 'g2', mode: 'Default', label: 'g2 / Default', taskIds: [] },
  ]);
  assert.throws(() => collectLists({}), /no "lists" object/);
});

test('applyStagger carries offsets across lists in selection order', () => {
  // data as above, with each task { id, startScheduleTime: 1, other: 'x' }; c has no startScheduleTime
  const lists = collectLists(data);
  const result = applyStagger(data, [lists[1], lists[0]], 1000, 250);
  assert.deepEqual(result.map(r => [r.taskId, r.time]), [['c', 1000], ['a', 1250], ['b', 1500]]);
  assert.equal(data.lists.g1.Restock.c.startScheduleTime, 1000);
  assert.equal(data.lists.g1.Default.b.startScheduleTime, 1500);
  assert.equal(data.lists.g1.Default.a.other, 'x');
  assert.deepEqual(applyStagger(data, [lists[0]], 5, 0).map(r => r.time), [5, 5]);
});

test('detectIndent', () => {
  assert.equal(detectIndent('{\n    "a": 1\n}'), 4);
  assert.equal(detectIndent('{\n  "a": 1\n}'), 2);
  assert.equal(detectIndent('{\n\t"a": 1\n}'), '\t');
  assert.equal(detectIndent('{"a":1}'), 0);
});

test('serializeLike preserves BOM and trailing newline', () => {
  const original = '\uFEFF{\n    "a": 1\n}\n';
  const data = parseTasksJson(original);
  data.a = 2;
  assert.equal(serializeLike(original, data), '\uFEFF{\n    "a": 2\n}\n');
  assert.equal(serializeLike('{"a":1}', { a: 2 }), '{"a":2}');
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL, because `src/valor/tasks.js` cannot be found.

- [ ] **Step 3: Implement the functions in `src/valor/tasks.js` with the signatures above.** `parseLocalDateTime`: match `/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?$/`, build `new Date(y, m - 1, d, h, mi, s, ms)`, and reject unless all of `getFullYear/getMonth/getDate/getHours/getMinutes/getSeconds` round-trip. The error message is `Enter a date like 2026-10-09 10:00 (optionally :SS or :SS.mmm)`. `parseSelection` splits on `,`, trims each part, accepts `n` or `a-b` with `1 <= a <= b <= count`, and accepts `all` case-insensitively for the whole input. The error message names the offending part and the valid range `1-${count}`.

- [ ] **Step 4: Run `npm test`.** Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json src/valor/tasks.js test/valor-tasks.test.js
git commit -m "Add pure valor task-list logic for stagger-start"
```

---

### Task 2: Prompter (`src/lib/prompt.js`) and system helpers (`src/valor/system.js`)

**Files:**
- Create: `src/lib/prompt.js`
- Create: `src/valor/system.js`
- Create: `test/prompt.test.js`
- Create: `test/valor-system.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class CancelledError extends Error` (message `'Cancelled'`), exported from `src/lib/prompt.js`.
  - `createPrompter({ input = process.stdin, output = process.stdout } = {}) -> { ask(question: string, parse: (s: string) => T): Promise<T>, close(): void }`. `ask` writes `question + ' '` to `output` and takes the next line. If `parse` throws, it writes `` `  ${err.message}\n` `` and asks again. When input ends, pending and later `ask` calls reject with `CancelledError`. `'SIGINT'` on the interface does the same and closes it.
  - `defaultTasksPath({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) -> string`. `darwin` → `path.posix.join(homedir, 'Library/Application Support/valor3/tasks.json')`. `win32` → `path.win32.join(env.APPDATA, 'valor3', 'tasks.json')`. Throws `Error('Cannot find Valor\'s tasks.json on this system. Use --file to point at it.')` if the platform is unsupported or `APPDATA` is unset on win32.
  - `isValorRunning({ platform = process.platform } = {}) -> Promise<boolean>`. darwin: `execFile('pgrep', ['-i', 'valor'])`, where exit 0 means true. win32: `execFile('tasklist')`, true if stdout matches `/valor/i`. Any error or other platform → false.
  - `backupAndWrite(filePath: string, text: string, now = new Date()) -> Promise<string>`. Copies `filePath` to `` `${filePath}.${now.toISOString().replaceAll(':', '-')}.bak` ``, writes `text` to `${filePath}.tmp`, renames it over `filePath`, and returns the backup path.

- [ ] **Step 1: Write the failing tests.** `test/prompt.test.js` uses `PassThrough` streams for input and output:

```js
test('answers buffered before ask are not lost', async () => {
  const input = new PassThrough(); const output = new PassThrough();
  input.write('1\n2\n');
  const p = createPrompter({ input, output });
  assert.equal(await p.ask('A?', Number), 1);
  assert.equal(await p.ask('B?', Number), 2);
  p.close();
});

test('re-asks until parse succeeds, printing the error', async () => {
  // input 'x\n5\n'; parse throws Error('nope') unless /^\d+$/
  // expect result 5, and output text contains 'nope' and 'Q?' twice
});

test('input end rejects with CancelledError', async () => {
  // input.end() with no lines → ask rejects instanceOf CancelledError
});

test('SIGINT rejects with CancelledError', async () => {
  // const pending = p.ask('Q?', String); p.rl.emit('SIGINT');
  // await assert.rejects(pending, CancelledError)
});
```

Add `rl` (the readline `Interface`) to the prompter's return value so the SIGINT test can emit on it.

`test/valor-system.test.js`:

```js
test('defaultTasksPath', () => {
  assert.equal(defaultTasksPath({ platform: 'darwin', env: {}, homedir: '/Users/j' }),
    '/Users/j/Library/Application Support/valor3/tasks.json');
  assert.equal(defaultTasksPath({ platform: 'win32', env: { APPDATA: 'C:\\Users\\j\\AppData\\Roaming' }, homedir: 'C:\\Users\\j' }),
    'C:\\Users\\j\\AppData\\Roaming\\valor3\\tasks.json');
  assert.throws(() => defaultTasksPath({ platform: 'win32', env: {}, homedir: 'C:\\Users\\j' }), /--file/);
  assert.throws(() => defaultTasksPath({ platform: 'linux', env: {}, homedir: '/home/j' }), /--file/);
});

test('backupAndWrite', async () => {
  // temp dir via fs.mkdtemp(os.tmpdir()); write 'old' to tasks.json
  // backupAndWrite(file, 'new', new Date('2026-10-08T14:03:11.000Z'))
  // returns path ending 'tasks.json.2026-10-08T14-03-11.000Z.bak'; backup reads 'old'; file reads 'new'; no tasks.json.tmp left
});

test('isValorRunning resolves to a boolean and false on unsupported platform', async () => {
  assert.equal(typeof await isValorRunning(), 'boolean');
  assert.equal(await isValorRunning({ platform: 'aix' }), false);
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL, because the modules cannot be found.

- [ ] **Step 3: Implement `src/lib/prompt.js`.** Use `readline.createInterface({ input, output, terminal: false })` from `node:readline`, not the promises API. Keep a FIFO `lines` array and a single pending waiter, both fed by the `'line'` event, so lines that arrive early are kept. Track an `ended` flag set on `'close'`. Register `rl.on('SIGINT', …)` to reject and close.

- [ ] **Step 4: Implement `src/valor/system.js`** with the signatures above, using `node:fs/promises` (`copyFile`, `writeFile`, `rename`) and `node:util` `promisify(execFile)`.

- [ ] **Step 5: Run `npm test`.** Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prompt.js src/valor/system.js test/prompt.test.js test/valor-system.test.js
git commit -m "Add readline prompter and valor system helpers"
```

---

### Task 3: Command orchestration, end-to-end test, README

**Files:**
- Modify: `src/commands/valor-stagger-start.js` (replace the placeholder body)
- Create: `test/fixtures/tasks.json`
- Create: `test/valor-stagger-start.e2e.test.js`
- Modify: `README.md` (command table row)

**Interfaces:**
- Consumes: everything listed under Produces in Tasks 1 and 2.
- Produces: `export const description = 'Stagger startScheduleTime across selected Valor task lists'` and `export async function run(argv) -> Promise<number>`.

- [ ] **Step 1: Create the fixture `test/fixtures/tasks.json`.** Use 4-space indent and a trailing newline. Group `g1` has `name: "Pokemon"`. Under `lists.g1`, `Default` has tasks `d1, d2, d3` and `Restock` has tasks `r1, r2`. Each task has `id`, `status: "Idle"` and `startScheduleTime: 1791489288000`. Also add `lists.g2.Default: {}`, with `g2` absent from `groups`, so the menu shows a third, empty list `g2 / Default (0 tasks)`.

- [ ] **Step 2: Write `test/valor-stagger-start.e2e.test.js`.** Each test copies the fixture into a fresh `mkdtemp` dir and spawns `process.execPath bin/valor-stagger-start.js --file <copy> [...]` with `spawnSync` and the answers as `input`:

```js
const start = new Date(2030, 0, 15, 10, 0).getTime();

test('staggers selected lists as one sequence and writes a backup', () => {
  const r = run(['--file', file], '2,1\n2030-01-15 10:00\n250\ny\n');
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const t = (mode, id) => data.lists.g1[mode][id].startScheduleTime;
  assert.deepEqual([t('Restock','r1'), t('Restock','r2'), t('Default','d1'), t('Default','d2'), t('Default','d3')],
    [0, 1, 2, 3, 4].map(n => start + n * 250));
  assert.equal(data.lists.g1.Default.d1.status, 'Idle');
  assert.ok(readFileSync(file, 'utf8').endsWith('}\n'));
  assert.ok(readFileSync(file, 'utf8').includes('\n    "groups"'));
  const bak = readdirSync(dir).find(f => f.endsWith('.bak'));
  assert.equal(readFileSync(join(dir, bak), 'utf8'), fixtureText);
  assert.match(r.stdout, /Updated 5 tasks\./);
});

test('re-prompts on bad input', () => {
  // input '9\n1\n2030-02-30 10:00\n2030-01-15 10:00\n-5\n100\ny\n' → status 0, d1..d3 = start + 0/100/200
});

test('--dry-run writes nothing', () => {
  // input '1\n2030-01-15 10:00\n250\n' with --dry-run → status 0, file unchanged, stdout matches /Dry run: no changes written\./, no .bak
});

test('answering n writes nothing', () => {
  // input '1\n2030-01-15 10:00\n250\nn\n' → status 0, file unchanged, no .bak
});

test('stdin ending early exits without writing', () => {
  // input '1\n' → status 130, file unchanged, stdout or stderr matches /Cancelled\./
});

test('selecting only empty lists exits without asking more', () => {
  // input '3\n' → status 0, stdout matches /Selected lists have no tasks\. Nothing to do\./, does not match /Start time/, file unchanged
});

test('missing file reports path and --file hint', () => {
  // --file <dir>/nope.json → status 1, stderr matches /Cannot read .*nope\.json.*--file/
});
```

- [ ] **Step 3: Run `npm test`.** Expected: the e2e tests fail, because the placeholder prints "not implemented yet".

- [ ] **Step 4: Implement `run(argv)`.** Follow the 11-step flow in the spec's **Flow** section exactly, with its prompt strings and messages. Specifics the spec leaves open:
  - Read the file with `readFile(path, 'utf8')`. Wrap failures as `` Error(`Cannot read ${path}: ${err.message}. Use --file to point at tasks.json.`) ``. Wrap JSON errors as `` Error(`${path} is not valid JSON: ${err.message}`) ``.
  - Menu line: `` `  ${i + 1}) ${label.padEnd(width)}   (${n} task${n === 1 ? '' : 's'})` ``, where `width` is the longest label.
  - Preview lines: `` `  #${index + 1}  ${label}  ${time}` ``. Time is local `HH:MM:SS.mmm`, prefixed by `YYYY-MM-DD ` when that date differs from the start date. Show every task when there are 6 or fewer, otherwise the first 3, `  ...`, and the last 3. The past-start warning is `⚠ Start time is in the past.` and the running warning is `⚠ Valor appears to be running; quit it first or it may overwrite this file.`
  - Zero-task message: `Selected lists have no tasks. Nothing to do.`
  - Create the prompter once, and close it in a `finally`. Catch `CancelledError`, print `Cancelled.`, and return 130. All other errors propagate to `src/run.js`.
  - Update `description` and the `usage` text to list `--file <path>`.

- [ ] **Step 5: Run `npm test` and `npm run check`.** Expected: all tests pass, and check prints `✓ 1 command(s) wired up`.

- [ ] **Step 6: Change the README command table row** to `` | `valor-stagger-start` | Stagger `startScheduleTime` across selected Valor task lists (`--dry-run` to preview) | ``.

- [ ] **Step 7: Commit**

```bash
git add src/commands/valor-stagger-start.js test/fixtures/tasks.json test/valor-stagger-start.e2e.test.js README.md
git commit -m "Implement valor-stagger-start"
```
