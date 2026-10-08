import { parseArgs } from 'node:util';

export const description = 'Placeholder: logic not implemented yet';

const usage = `Usage: valor-stagger-start [options]

${description}

Options:
  --dry-run    Print what would happen without doing it
  -h, --help   Show this help`;

export async function run(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(usage);
    return 0;
  }

  // TODO: implement valor-stagger-start
  console.log('valor-stagger-start: not implemented yet', { dryRun: values['dry-run'] });
  return 0;
}
