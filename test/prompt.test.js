import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createPrompter, CancelledError } from '../src/lib/prompt.js';

test('answers buffered before ask are not lost', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  input.write('1\n2\n');
  const p = createPrompter({ input, output });
  assert.equal(await p.ask('A?', Number), 1);
  assert.equal(await p.ask('B?', Number), 2);
  p.close();
});

test('re-asks until parse succeeds, printing the error', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => { text += chunk; });
  input.write('x\n5\n');
  const p = createPrompter({ input, output });
  const parse = (s) => {
    if (!/^\d+$/.test(s)) throw new Error('nope');
    return Number(s);
  };
  assert.equal(await p.ask('Q?', parse), 5);
  p.close();
  assert.match(text, /nope/);
  assert.equal(text.split('Q?').length - 1, 2);
});

test('input end rejects with CancelledError', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const p = createPrompter({ input, output });
  input.end();
  await assert.rejects(p.ask('Q?', String), CancelledError);
  await assert.rejects(p.ask('Q2?', String), CancelledError);
  p.close();
});

test('SIGINT rejects with CancelledError', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const p = createPrompter({ input, output });
  const pending = p.ask('Q?', String);
  p.rl.emit('SIGINT');
  await assert.rejects(pending, CancelledError);
  await assert.rejects(p.ask('Q2?', String), CancelledError);
});
