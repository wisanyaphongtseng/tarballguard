# Required-file checking — Day 1 Milestone 2

`src/engine/required-files.ts` exposes a synchronous policy check:

```ts
checkRequiredFiles(
  index: ArchiveIndex,
  requiredPaths: readonly string[],
): readonly RequiredFileFinding[]
```

Pass an index returned by successful `ingestArchive` and zero or more expected file paths. The checker trusts the ingestion index; it does not validate caller-fabricated indexes or re-read the archive. It only reads file paths, never payload bytes. Findings contain only a canonical `path` and `status` (`FOUND` or `MISSING`). The findings and returned array are frozen. This check produces no overall audit/pass result.

## Path semantics

Required paths are relative to the already-stripped `package/` root. `dist/index.html` checks that exact package-relative file. A leading `package/` is a literal subdirectory, not another prefix to strip: `package/app.js` checks an archive entry named `package/package/app.js`.

The checker adapts required paths to the existing archive path validator. Leading `./`, repeated separators, and `.` segments normalize identically to ingestion. Canonical duplicates are deduplicated after validation. Findings are sorted by code-unit path order, independent of policy order. Each original entry is validated, including duplicates; no partial findings are returned if any entry is invalid.

Empty paths, root-only paths (`.` or `./`), trailing slashes, absolute paths, every `..` segment, backslashes, colons, ASCII C0 controls, and DEL are invalid. The policy must be an array of strings. Invalid policy throws `RequiredFilePolicyError` with code `INVALID_POLICY`; `entryIndex` identifies the first invalid entry using zero-based indexing, or is undefined when the policy itself is not an array. Error messages do not include caller paths or package contents.

Matching is case-sensitive. Unicode NFC/NFD spellings remain distinct. No whitespace trimming, URL decoding, Unicode normalization, query removal, or fragment removal occurs. Percent escapes, spaces, `?`, and `#` are literal filename text. The existing ingestion policy for other Unicode controls is unchanged; future UI must visibly escape controls and bidi characters and display paths as text.

Only regular files satisfy assertions, including zero-byte files. Directories are absent from `index.files`; a required path such as `dist` therefore returns `MISSING` when only that directory exists. `dist/` is an invalid file policy, not a directory assertion. An empty array produces no findings; it does not imply that the artifact passed an audit.

## Acceptance fixture and verification

`tests/fixtures/missing-required-file.tgz` is a deterministic USTAR/gzip fixture containing `package.json` and `lib/index.js`, with no `dist/index.html`. Its source entries are in `tests/required-file-fixture.ts`. Ingesting this fixture and checking `['dist/index.html']` returns exactly:

```ts
[{ path: 'dist/index.html', status: 'MISSING' }]
```

Regenerate from the repository root without executing package code:

```powershell
node --input-type=module -e "import { writeFileSync } from 'node:fs'; import { tgzFixture } from './tests/archive-fixture.ts'; import { missingRequiredFileEntries } from './tests/required-file-fixture.ts'; writeFileSync('tests/fixtures/missing-required-file.tgz', Buffer.from(tgzFixture(missingRequiredFileEntries)));"
```

Tests also check an actual npm-generated artifact and verify that fixture regeneration produces identical bytes. Run `npm test`, `npm run typecheck`, and `npm run build`.

PAX/GNU extensions remain explicitly unsupported by ingestion. No HTML/reference scanning, UI, telemetry, dependencies, or archive-format support are added here.
