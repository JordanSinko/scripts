import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultTasksPath, backupAndWrite, isValorRunning } from '../src/valor/system.js';

test('defaultTasksPath', () => {
  assert.equal(
    defaultTasksPath({ platform: 'darwin', env: {}, homedir: '/Users/j' }),
    '/Users/j/Library/Application Support/valor3/tasks.json',
  );
  assert.equal(
    defaultTasksPath({
      platform: 'win32',
      env: { APPDATA: 'C:\\Users\\j\\AppData\\Roaming' },
      homedir: 'C:\\Users\\j',
    }),
    'C:\\Users\\j\\AppData\\Roaming\\valor3\\tasks.json',
  );
  assert.throws(() => defaultTasksPath({ platform: 'win32', env: {}, homedir: 'C:\\Users\\j' }), /--file/);
  assert.throws(() => defaultTasksPath({ platform: 'linux', env: {}, homedir: '/home/j' }), /--file/);
});

test('backupAndWrite', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'valor-system-'));
  try {
    const file = path.join(dir, 'tasks.json');
    await fs.writeFile(file, 'old');
    const backup = await backupAndWrite(file, 'new', new Date('2026-10-08T14:03:11.000Z'));
    assert.ok(backup.endsWith('tasks.json.2026-10-08T14-03-11.000Z.bak'));
    assert.equal(await fs.readFile(backup, 'utf8'), 'old');
    assert.equal(await fs.readFile(file, 'utf8'), 'new');
    await assert.rejects(fs.access(`${file}.tmp`));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('isValorRunning resolves to a boolean and false on unsupported platform', async () => {
  assert.equal(typeof (await isValorRunning()), 'boolean');
  assert.equal(await isValorRunning({ platform: 'aix' }), false);
});
