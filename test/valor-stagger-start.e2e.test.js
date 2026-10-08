import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = join(root, 'test/fixtures/tasks.json');
const fixtureText = readFileSync(fixture, 'utf8');
const start = new Date(2030, 0, 15, 10, 0).getTime();

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'valor-stagger-'));
  const file = join(dir, 'tasks.json');
  copyFileSync(fixture, file);
  return { dir, file };
}

function run(args, input) {
  return spawnSync(process.execPath, [join(root, 'bin/valor-stagger-start.js'), ...args], {
    input,
    encoding: 'utf8',
  });
}

const backups = (dir) => readdirSync(dir).filter((f) => f.endsWith('.bak'));

test('staggers selected lists as one sequence and writes a backup', () => {
  const { dir, file } = setup();
  const r = run(['--file', file], '2,1\n2030-01-15 10:00\n250\ny\n');
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const t = (mode, id) => data.lists.g1[mode][id].startScheduleTime;
  assert.deepEqual(
    [t('Restock', 'r1'), t('Restock', 'r2'), t('Default', 'd1'), t('Default', 'd2'), t('Default', 'd3')],
    [0, 1, 2, 3, 4].map((n) => start + n * 250),
  );
  assert.equal(data.lists.g1.Default.d1.status, 'Idle');
  const text = readFileSync(file, 'utf8');
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.includes('\n    "groups"'));
  const [bak] = backups(dir);
  assert.equal(readFileSync(join(dir, bak), 'utf8'), fixtureText);
  assert.match(r.stdout, /Updated 5 tasks\./);
});

test('re-prompts on bad input', () => {
  const { file } = setup();
  const r = run(['--file', file], '9\n1\n2030-02-30 10:00\n2030-01-15 10:00\n-5\n100\ny\n');
  assert.equal(r.status, 0, r.stderr);
  const d = JSON.parse(readFileSync(file, 'utf8')).lists.g1.Default;
  assert.deepEqual(
    [d.d1, d.d2, d.d3].map((x) => x.startScheduleTime),
    [0, 100, 200].map((n) => start + n),
  );
});

test('--dry-run writes nothing', () => {
  const { dir, file } = setup();
  const r = run(['--file', file, '--dry-run'], '1\n2030-01-15 10:00\n250\n');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Dry run: no changes written\./);
  assert.equal(readFileSync(file, 'utf8'), fixtureText);
  assert.deepEqual(backups(dir), []);
});

test('answering n writes nothing', () => {
  const { dir, file } = setup();
  const r = run(['--file', file], '1\n2030-01-15 10:00\n250\nn\n');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(file, 'utf8'), fixtureText);
  assert.deepEqual(backups(dir), []);
});

test('stdin ending early exits without writing', () => {
  const { dir, file } = setup();
  const r = run(['--file', file], '1\n');
  assert.equal(r.status, 130);
  assert.match(r.stdout + r.stderr, /Cancelled\./);
  assert.equal(readFileSync(file, 'utf8'), fixtureText);
  assert.deepEqual(backups(dir), []);
});

test('selecting only empty lists exits without asking more', () => {
  const { file } = setup();
  const r = run(['--file', file], '3\n');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Selected lists have no tasks\. Nothing to do\./);
  assert.doesNotMatch(r.stdout, /Start time/);
  assert.equal(readFileSync(file, 'utf8'), fixtureText);
});

test('missing file reports path and --file hint', () => {
  const { dir } = setup();
  const r = run(['--file', join(dir, 'nope.json')], '');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Cannot read .*nope\.json.*--file/);
});

test('file without a lists object names the file', () => {
  const { dir } = setup();
  const file = join(dir, 'empty.json');
  writeFileSync(file, '{}');
  const r = run(['--file', file], '');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes(file), r.stderr);
  assert.ok(r.stderr.includes('no "lists" object'), r.stderr);
  assert.equal(readFileSync(file, 'utf8'), '{}');
});
