# valor-stagger-start design

Date: 2026-10-08

## Goal

Valor stores its tasks in a local `tasks.json`. Each task has a `startScheduleTime` (epoch milliseconds). `valor-stagger-start` rewrites those times for one or more selected lists. The first task starts at a time the user enters, and every later task starts a fixed interval after the one before it.

When several lists are selected, they form one combined sequence. The offset keeps counting across list boundaries and does not restart for each list. Two lists of 100 tasks with interval X span `200 × X`, not `100 × X` with the lists overlapping.

## Data shape

```jsonc
{
  "groups": {
    "<groupId>": { "id": "<groupId>", "name": "Pokemon", ... }
  },
  "lists": {
    "<groupId>": {
      "<mode>": {                      // e.g. "Default"
        "<taskId>": { "id": "<taskId>", "startScheduleTime": 1791489288000, ... }
      }
    }
  }
}
```

A **list** is one `lists[groupId][mode]` object. Its label is `<groups[groupId].name> / <mode>`. If the group has no entry in `groups`, the label uses the `groupId`.

## File location

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/valor3/tasks.json` |
| Windows | `%APPDATA%\valor3\tasks.json` (`%APPDATA%` already points to `...\AppData\Roaming`) |

Any other platform requires `--file`. `--file <path>` overrides the default on every platform.

## CLI

```
valor-stagger-start [--file <path>] [--dry-run] [-h|--help]
```

There are no flags for start time, interval, or selection. Those are always prompted, and the prompts have no defaults.

## Flow

1. Resolve the path, then read and parse the file. Print `Using <path>`.
2. Collect the lists in JSON order and print a numbered menu: `N) <label>   (<count> tasks)`.
3. Prompt `Select lists (e.g. 1,2 or 1-2 or all):`. Accepted input is comma-separated numbers and inclusive ranges `a-b`, or `all`. Whitespace is ignored. The order typed is the stagger order. A list given more than once is used once, at its first position. Numbers out of range or malformed input trigger an error message and a re-prompt. If the selected lists contain 0 tasks in total, print that and exit 0 without asking anything else.
4. Prompt `Start time (YYYY-MM-DD HH:MM[:SS[.mmm]], local):`. The input is parsed as local time. Impossible dates such as `2026-02-30` and times such as `25:00` are rejected by checking that the constructed `Date` round-trips to the same fields. The prompt repeats until valid.
5. Prompt `Interval between tasks (ms):`. The value must be a non-negative integer. The prompt repeats until valid.
6. Compute the new times. Take tasks in selection order, and within each list in JSON key order. Task `n` (0-based across the whole sequence) gets `start + n × interval`.
7. Print a preview: the total task and list count, the first 3 and last 3 tasks (`#index  label  HH:MM:SS.mmm`, plus the date when it differs from the start date) with `...` between them, and a warning if the start time is in the past.
8. If `--dry-run` is set, print `Dry run: no changes written.` and exit 0.
9. If Valor appears to be running, print a warning that it may overwrite the file.
10. Prompt `Write changes? (y/N):`. Anything other than `y` or `yes` (case-insensitive) exits 0 without writing.
11. Copy the original file to `tasks.json.<ISO timestamp with : replaced by ->.bak` in the same folder. Write the new JSON to `tasks.json.tmp` and rename it over `tasks.json`. Print the backup path and `Updated N tasks.`

Ctrl-C or stdin ending at any prompt exits without writing.

Only `startScheduleTime` changes. The field is set even on tasks that lack it. Key order and every other value are preserved. The output keeps the file's indentation (detected from the first indented line: tabs or N spaces, or minified if none) and its trailing newline, if any.

## Modules

| File | Responsibility |
| --- | --- |
| `src/commands/valor-stagger-start.js` | Orchestration: args, prompts, preview, confirm, write. |
| `src/valor/tasks.js` | Pure functions: `collectLists(data)` returns `[{ groupId, mode, label, taskIds }]`; `parseSelection(input, count)` returns 0-based indexes; `parseLocalDateTime(str)` returns epoch ms; `applyStagger(data, lists, startMs, intervalMs)` mutates `data` and returns `[{ list, taskId, time }]`; `detectIndent(text)` returns the indent for `JSON.stringify`. |
| `src/valor/system.js` | OS-facing functions: `defaultTasksPath(platform, env, homedir)`, `isValorRunning()`, `backupAndWrite(path, text)` (returns the backup path). |
| `src/lib/prompt.js` | `createPrompter()` returns `{ ask(question, parse), close() }` on top of `node:readline/promises`. `ask` prints a parse error and asks again until `parse` returns. It rejects if the input stream ends. |

`isValorRunning()` uses `pgrep -i valor` on macOS and `tasklist` (output checked for "valor", ignoring case) on Windows. If the check fails or the platform is unsupported, it returns `false`. The match is loose because Valor's exact process name is unknown.

There are no runtime dependencies.

## Errors

- File not found or unreadable: `Cannot read <path>: <reason>. Use --file to point at tasks.json.` Exit 1.
- Invalid JSON, or no `lists` object: the error names the file. Exit 1, nothing written.
- Unsupported platform without `--file`: the error asks for `--file`.

## Testing

`npm test` runs `node --test`.

- `test/valor-tasks.test.js`: selection parsing (commas, ranges, `all`, whitespace, duplicates, out of range, malformed input); date parsing (valid with and without seconds or ms, invalid dates and times, garbage); `collectLists` labels, including the missing-group fallback; stagger math across multiple lists (offsets carry across lists, interval 0); only `startScheduleTime` changes; `detectIndent` (4 spaces, 2 spaces, tab, minified).
- `test/valor-stagger-start.e2e.test.js`: spawns `bin/valor-stagger-start.js --file <temp copy of fixture>` and pipes in answers. It checks the written times, that the backup exists and matches the original, and that a `--dry-run` run or a `n` answer at the confirmation leaves the file unchanged.

The README command table is updated to describe the command.
