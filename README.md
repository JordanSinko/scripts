# scripts

CLI scripts you run straight from GitHub with `npx`. Nothing is published to a registry.

## Usage

```sh
# Run a command by name
npx -p github:JordanSinko/scripts valor-stagger-start --help

# Or use the dispatcher (the default bin, named after the package)
npx github:JordanSinko/scripts valor-stagger-start --help
npx github:JordanSinko/scripts            # list commands

# Pin to a branch, tag, or commit
npx -p github:JordanSinko/scripts#v0.1.0 valor-stagger-start
```

npx caches by commit. Run with `--yes` to skip the install prompt. If the repo is private, your git credentials need read access to it.

## Commands

| Command | Description |
| --- | --- |
| `valor-stagger-start` | Stagger `startScheduleTime` across selected Valor task lists (`--dry-run` to preview) |

## Adding a command

1. Create `src/commands/<name>.js` that exports `run(argv)`. It returns an exit code; thrown errors print and exit 1.
2. Register it in `src/commands/index.js`.
3. Add `bin/<name>.js` (copy `bin/valor-stagger-start.js` and change the name), then run `chmod +x`.
4. Add `"<name>": "bin/<name>.js"` to `bin` in `package.json`.
5. Run `npm run check` to confirm the pieces line up.

Use Node built-ins where you can (`node:util` `parseArgs`, `fetch`, `node:fs/promises`). Every dependency adds to the install time of each fresh `npx` run. Don't add a build step: npx runs the files exactly as they sit in the repo.

Set `DEBUG=1` to print stack traces on error.
