'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runner = path.join(root, 'scripts/run-tsx.cjs');
const entryArgs = process.argv.slice(2);
const args = entryArgs.length > 0 ? entryArgs : ['./src/index.ts'];

const result = spawnSync(process.execPath, [runner, ...args], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status === null ? 1 : result.status);
