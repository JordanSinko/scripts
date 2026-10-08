import readline from 'node:readline';

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

// Line-based prompter. Lines that arrive before ask() are queued, not lost.
export function createPrompter({ input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, output, terminal: false });
  const lines = [];
  let waiter = null;
  let ended = false;

  function end() {
    ended = true;
    if (waiter) {
      const { reject } = waiter;
      waiter = null;
      reject(new CancelledError());
    }
  }

  rl.on('line', (line) => {
    if (waiter) {
      const { resolve } = waiter;
      waiter = null;
      resolve(line);
    } else {
      lines.push(line);
    }
  });
  rl.on('close', end);
  // With terminal: false a real Ctrl-C is a process signal (default kill); this only fires if something emits 'SIGINT' on the interface.
  rl.on('SIGINT', () => {
    lines.length = 0;
    end();
    rl.close();
  });

  function nextLine() {
    if (lines.length > 0) return Promise.resolve(lines.shift());
    if (ended) return Promise.reject(new CancelledError());
    return new Promise((resolve, reject) => {
      waiter = { resolve, reject };
    });
  }

  async function ask(question, parse) {
    for (;;) {
      output.write(`${question} `);
      const line = await nextLine();
      try {
        return parse(line);
      } catch (err) {
        output.write(`  ${err.message}\n`);
      }
    }
  }

  return { ask, close: () => rl.close(), rl };
}
