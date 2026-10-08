const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function collectLists(data) {
  if (!isPlainObject(data?.lists)) throw new Error('tasks.json has no "lists" object');
  const out = [];
  for (const [groupId, modes] of Object.entries(data.lists)) {
    if (!isPlainObject(modes)) continue;
    for (const [mode, tasks] of Object.entries(modes)) {
      if (!isPlainObject(tasks)) continue;
      out.push({
        groupId,
        mode,
        label: `${data.groups?.[groupId]?.name ?? groupId} / ${mode}`,
        taskIds: Object.entries(tasks)
          .filter(([, task]) => isPlainObject(task))
          .map(([id]) => id),
      });
    }
  }
  return out;
}

export function parseSelection(input, count) {
  const text = input.trim();
  if (text.toLowerCase() === 'all') return Array.from({ length: count }, (_, i) => i);
  const picked = [];
  for (const raw of text.split(',')) {
    const part = raw.trim();
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    const a = m && Number(m[1]);
    const b = m && (m[2] === undefined ? a : Number(m[2]));
    if (!m || a < 1 || a > b || b > count) {
      throw new Error(`Invalid selection "${part}". Use numbers or ranges within 1-${count}, or "all"`);
    }
    for (let n = a; n <= b; n++) if (!picked.includes(n - 1)) picked.push(n - 1);
  }
  return picked;
}

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?$/;

export function parseLocalDateTime(input) {
  const m = DATE_TIME.exec(input.trim());
  const message = 'Enter a date like 2026-10-09 10:00 (optionally :SS or :SS.mmm)';
  if (!m) throw new Error(message);
  const [y, mo, d, h, mi, s, ms] = m.slice(1).map((v) => Number(v ?? 0));
  const date = new Date(y, mo - 1, d, h, mi, s, ms);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d ||
    date.getHours() !== h ||
    date.getMinutes() !== mi ||
    date.getSeconds() !== s
  ) {
    throw new Error(message);
  }
  return date.getTime();
}

export function parseInterval(input) {
  const text = input.trim();
  if (!/^\d+$/.test(text)) throw new Error('Enter a whole number of milliseconds (0 or more)');
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new Error('Enter a whole number of milliseconds (0 or more)');
  return value;
}

export function applyStagger(data, lists, startMs, intervalMs) {
  const result = [];
  let time = startMs;
  for (const list of lists) {
    for (const taskId of list.taskIds) {
      data.lists[list.groupId][list.mode][taskId].startScheduleTime = time;
      result.push({ list, taskId, time });
      time += intervalMs;
    }
  }
  return result;
}

export function parseTasksJson(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

export function detectIndent(text) {
  const m = /^([ \t]+)"/m.exec(text);
  if (!m) return 0;
  return m[1][0] === '\t' ? '\t' : m[1].length;
}

export function serializeLike(originalText, data) {
  const bom = originalText.startsWith('\uFEFF') ? '\uFEFF' : '';
  const newline = /\n$/.test(originalText) ? '\n' : '';
  return bom + JSON.stringify(data, null, detectIndent(originalText)) + newline;
}
