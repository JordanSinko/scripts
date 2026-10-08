import { execFile } from 'node:child_process';
import { copyFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function defaultTasksPath({
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
} = {}) {
  if (platform === 'darwin') {
    return path.posix.join(homedir, 'Library/Application Support/valor3/tasks.json');
  }
  if (platform === 'win32' && env.APPDATA) {
    return path.win32.join(env.APPDATA, 'valor3', 'tasks.json');
  }
  throw new Error("Cannot find Valor's tasks.json on this system. Use --file to point at it.");
}

export async function isValorRunning({ platform = process.platform } = {}) {
  try {
    if (platform === 'darwin') {
      await execFileAsync('pgrep', ['-i', 'valor']);
      return true;
    }
    if (platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist');
      return /valor/i.test(stdout);
    }
  } catch {
    // pgrep exits non-zero when nothing matches
  }
  return false;
}

// Keeps a timestamped backup, then swaps the new file in via a temp file.
export async function backupAndWrite(filePath, text, now = new Date()) {
  const backupPath = `${filePath}.${now.toISOString().replaceAll(':', '-')}.bak`;
  await copyFile(filePath, backupPath);
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, text);
  await rename(tmpPath, filePath);
  return backupPath;
}
