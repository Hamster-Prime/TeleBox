# 18 Tests Coverage

## Evidence

Original audit evidence:

- No `tests/` or `test/` directory was found.
- No `.github` workflow or YAML CI config was found.
- `package.json` had no `test`, `typecheck`, `lint`, `prepublish`, or `prepare` scripts.
- `npx --no-install tsc --noEmit` could not run because dependencies were missing.

Post-fix evidence:

- `tests/run-tests.ts` covers path containment, remote plugin URL allowlisting, delegated command policy, generation drain timeout, cron in-flight drain, channel-gap private-field adapters, and HTML patch sentinel collision behavior.
- `package.json` now provides `typecheck`, `typecheck:plugins`, `test`, and `audit` scripts.
- `npm ci`, `npm run typecheck`, `npm run typecheck:plugins`, `npm test`, and `npm run audit` pass, including a Node 24 validation pass.

## Impact

Effective automated coverage is 0% from repository evidence. The riskiest missing tests are lifecycle reload/drain, path containment in TPM, shell command argument construction, sudo permissions, lowdb write serialization, and PM2 single-instance deployment.

## Minimal Test Matrix

1. Unit: `parseTarget`, path sanitizer, `.env` serializer, `getCommandFromMessage`, `GenerationContext.drain()` timeout.
2. Integration: plugin load/reload with duplicate names, cron in-flight reload, alias DB cache, tpm install from a local fake index.
3. Security regression: reject path traversal filenames, reject shell metacharacters, deny sudo dangerous commands.
4. Platform smoke: Linux CI first; Windows/macOS after lockfile restoration.
