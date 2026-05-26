# 10 Performance And Memory

## Findings Referenced

- FND-003: unused/native dependencies increase install and memory surface.
- FND-016: backup all can create large temp archives.
- FND-017: repeat plugin can amplify message operations.
- FND-018: memory guard baseline/exit policy issues.
- FND-019: drain timeout residual resources.
- FND-023: alias DB hot-path IO.
- FND-027: sync SQLite open/close and no WAL.

## Dead / Optional Dependency Candidates

`@modelcontextprotocol/sdk`, `archiver`, `canvas`, `cheerio`, `js-yaml`, `lodash`, `modern-gif`, `node-schedule`, `opencc-js`, `p-limit`, `sharp`, and `ssh2` have no built-in source imports in this checkout. Treat them as candidates for removal, optional plugin dependencies, or documented peer dependencies.

## Memory Monitor Notes

- Default cron is hourly: `src/plugin/reload.ts:403-409`.
- Default thresholds are heap 150MB, RSS 512MB, growth 120MB: `src/plugin/reload.ts:71-82`.
- `safe`, `normal`, `aggressive` presets are documented in command text.
- `process.exit(0)` assumes a supervisor; see FND-018.

