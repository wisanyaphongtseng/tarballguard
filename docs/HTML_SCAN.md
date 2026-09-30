# Single-file HTML asset scan — Day 1 Milestone 5

```ts
scanHtmlFile(index: ArchiveIndex, htmlPath: string): readonly HtmlAssetFinding[]
```

The caller supplies an index returned by successful archive ingestion and the exact package-relative path of one regular HTML file. This module selects that file's retained bytes, calls `extractHtmlReferences`, resolves each reference with `resolveHtmlReference`, and checks only RESOLVED targets against the indexed regular-file paths. It does not re-read or extract the archive.

## Finding model

Each frozen finding contains `status`, `htmlPath`, and the original frozen extraction `reference`, including its tag, attribute, HTML-decoded literal value, and optional source location. FOUND/MISSING findings also contain `targetPath`. UNKNOWN/SKIPPED findings contain the resolver's unchanged explanatory `reason`, without a target path. The returned array is frozen; extraction references are neither changed nor copied.

| Resolver result | Archive lookup | Finding |
| --- | --- | --- |
| RESOLVED | Exact target regular file exists | FOUND |
| RESOLVED | No exact target regular file exists | MISSING |
| UNKNOWN | No target lookup | UNKNOWN with resolver reason |
| SKIPPED | No target lookup | SKIPPED with resolver reason |

Matching is exact and case-sensitive. Unicode forms remain distinct. Directories do not appear in ingestion's `files` array and cannot satisfy existence checks. For a reference `./assets` with only `assets/` packed, the finding is MISSING. A reference `./assets/` remains UNKNOWN under the resolver's directory-like syntax rule.

The scanner preserves extraction source order, including duplicate source elements. It does not sort or deduplicate findings. Missing assets are normal findings, not engine exceptions. Query/fragment stripping, percent preservation, path normalization, external URL detection, and all other classification behavior come entirely from the resolver. For `./app.js?v=1#boot`, lookup uses `app.js` relative to the HTML directory while the reference retains the suffix. `hello%20world.js` matches only a literal encoded filename, not `hello world.js`.

## Referring file and bounds

Supported referring filenames end in `.html` or `.htm`, with case-insensitive extension recognition. Full archive path matching remains case-sensitive. The index is trusted to contain ingestion's safe canonical regular-file paths; caller-fabricated indexes are not validated. The scanner accepts a path, not caller-supplied arbitrary HTML bytes.

A missing file, directory, unsupported extension, invalid path, or noncanonical path produces `HtmlScanError` with code `INVALID_HTML_FILE`. HTML-looking content in a `.txt` file is not scanned. The existing extraction limit of 1 MiB and strict UTF-8 decoding apply; `HTML_TOO_LARGE` or `INVALID_UTF8` errors propagate without partial findings. The scanner reads only the selected HTML payload and other files' path metadata. It does not read asset payloads, execute scripts, load resources, render markup, or expose package payload bytes in results.

## Core demonstration fixture

`tests/fixtures/missing-reference.tgz` is a deterministic USTAR/gzip artifact containing exactly `package/index.html` and `package/style.css`. HTML content:

```html
<link href="./style.css">
<script src="./app.js"></script>
```

Ingesting the artifact and scanning `index.html` produces FOUND `style.css`, then MISSING `app.js`. The missing finding identifies `index.html`, literal `./app.js`, tag `script`, attribute `src`, and attribute location line 2, column 9. The source entries are in `tests/html-scan-fixture.ts`. Regenerate from the repository root:

```powershell
node --input-type=module -e "import { writeFileSync } from 'node:fs'; import { tgzFixture } from './tests/archive-fixture.ts'; import { missingReferenceEntries } from './tests/html-scan-fixture.ts'; writeFileSync('tests/fixtures/missing-reference.tgz', Buffer.from(tgzFixture(missingReferenceEntries)));"
```

This fixture is generated from the deterministic test TAR builder; it is not an npm registry artifact. Tests ingest its actual checked-in compressed bytes and verify deterministic regeneration. No package code or lifecycle scripts run.

## Limitations and verification

FOUND proves only logical packed-path existence. UNKNOWN is not PASS. SKIPPED is not proof of package completeness. No package verdict, required-file composition, unauditable decision, or package-wide scanner is added.

Existing extraction/resolution limitations remain, including literal HTML scope, scripting-enabled `noscript` behavior, literal percent sequences, heuristic template detection, and absent document-level `<base>` semantics. Targets use the referring-file-relative logical model; this does not guarantee browser/runtime behavior. PAX/GNU archive support is unchanged.

Run `npm test`, `npm run typecheck`, and `npm run build`.
