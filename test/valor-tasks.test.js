import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStagger,
  collectLists,
  detectIndent,
  parseInterval,
  parseLocalDateTime,
  parseSelection,
  parseTasksJson,
  serializeLike,
} from '../src/valor/tasks.js';

const task = (id) => ({ id, startScheduleTime: 1, other: 'x' });

function makeData() {
  const c = task('c');
  delete c.startScheduleTime;
  return {
    groups: { g1: { name: 'Pokemon' } },
    lists: {
      g1: { Default: { a: task('a'), b: task('b') }, Restock: { c } },
      g2: { Default: {} },
    },
  };
}

test('parseSelection', () => {
  assert.deepEqual(parseSelection('2,1', 3), [1, 0]);
  assert.deepEqual(parseSelection(' 2 , 1 ', 3), [1, 0]);
  assert.deepEqual(parseSelection('1-3', 3), [0, 1, 2]);
  assert.deepEqual(parseSelection('1 - 3', 3), [0, 1, 2]);
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
  for (const bad of ['', '-1', '1.5', '1e3', '250ms', '99999999999999999999']) assert.throws(() => parseInterval(bad), Error, bad);
});

test('collectLists labels and order, missing-group fallback', () => {
  const data = makeData();
  assert.deepEqual(collectLists(data), [
    { groupId: 'g1', mode: 'Default', label: 'Pokemon / Default', taskIds: ['a', 'b'] },
    { groupId: 'g1', mode: 'Restock', label: 'Pokemon / Restock', taskIds: ['c'] },
    { groupId: 'g2', mode: 'Default', label: 'g2 / Default', taskIds: [] },
  ]);
  assert.throws(() => collectLists({}), /no "lists" object/);
});

test('applyStagger carries offsets across lists in selection order', () => {
  const data = makeData();
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

test('collectLists skips malformed groups, modes and tasks', () => {
  const data = {
    lists: {
      str: 'oops',
      g: { Bad: 'text', Nul: null, Arr: [1, 2], Ok: { a: {}, b: null, c: 5, d: { x: 1 } } },
    },
  };
  assert.deepEqual(collectLists(data), [{ groupId: 'g', mode: 'Ok', label: 'g / Ok', taskIds: ['a', 'd'] }]);
});
