# Literal reference resolution — Day 1 Milestone 4

```ts
resolveHtmlReference(htmlPath: string, original: HtmlReference): ResolvedReference
```

The caller supplies a canonical package-relative HTML file path and one reference from extraction. The synchronous result is frozen. `original` is the unchanged input reference object, retaining its value, tag, attribute, and location.

`ResolvedReference` has either `status: 'RESOLVED'` and `targetPath`, or `status: 'UNKNOWN' | 'SKIPPED'` and an explanatory `reason`. Only resolved results contain a target path. No index, archive, network, DOM, or filesystem is accessed. No dependencies are added.

## Classification table

Rules apply in the listed order. The referring file path is validated first; invalid or noncanonical paths produce UNKNOWN for any reference.

| Value category | Status | Reason |
| --- | --- | --- |
| Empty, whitespace-only, or surrounding whitespace | UNKNOWN | No trimming or document-self assumption |
| Backslash, ASCII C0 control, or DEL anywhere | UNKNOWN | Unsupported URL/path ambiguity |
| Contains `{{`, `${`, `<%`, or starts with `@` | UNKNOWN | Unresolved template syntax; no language evaluation |
| Starts with `#` | SKIPPED | Fragment-only reference, not another package file |
| Starts with `?` | UNKNOWN | Query-only document semantics |
| `http://`, `https://`, or `//` with a nonempty authority | SKIPPED | External network reference |
| `data:`, `javascript:`, `mailto:`, `tel:`, `blob:`, `about:` | SKIPPED | Recognized non-package scheme |
| Other scheme-looking prefix, including `C:` and `foo:` | UNKNOWN | Unsupported scheme or drive ambiguity |
| Starts with `/`, including incomplete `//` | UNKNOWN | Runtime web root is not the package root |
| Colon in the remaining path | UNKNOWN | Deliberate archive path restriction |
| Path ends with `/`, `.` segment, or `..` segment | UNKNOWN | Directory index/routing semantics are not inferred |
| Normalization attempts to move above package root | UNKNOWN | Unsafe traversal |
| Remaining literal relative file path | RESOLVED | Deterministic logical package target |

Scheme detection is ASCII and case-insensitive. External URL detection is a conservative syntactic classification, not URL validity checking. Bare `https:app.js`, `https://` without an authority, `file:`, and unrecognized schemes such as `ftp:` remain UNKNOWN. Classification does not depend on script/link/img or src/href.

## Path and diagnostic semantics

The referring path must already be canonical, as returned by ingestion. Its final segment is removed to obtain the directory. Relative reference segments are then processed left to right: empty segments and `.` disappear, and `..` removes one directory segment only when one exists. An attempted escape rejects resolution immediately, even if later segments would return inside the package.

For `dist/pages/index.html`, `./app.js` resolves to `dist/pages/app.js`, `../assets/logo.svg` to `dist/assets/logo.svg`, and `../../shared/app.js` to `shared/app.js`. `../../../outside.js` is UNKNOWN. Ingestion still rejects archive entries containing any `..`; only reference resolution permits bounded parent traversal. The final target is checked through the existing archive path validator.

The first literal `?` or `#` ends the path used for resolution. Query and fragment text remains unchanged in `original.value`. Template, control, and surrounding-whitespace checks examine the entire literal before this split. Thus a templated query remains UNKNOWN, while ordinary `./app.js?v=1#boot` resolves to `dist/app.js` from `dist/index.html`.

Percent sequences are never decoded or validated. `./hello%20world.js` targets the literal filename `hello%20world.js`. `./%2e%2e/secret.js` contains an ordinary `%2e%2e` directory, not parent traversal. This logical policy does not reproduce browser percent-decoding. Malformed percent sequences likewise remain literal text.

Case, Unicode normalization forms, internal spaces, and percent spelling remain unchanged. Repeated separators normalize only within relative paths; a leading `//` is handled as a network reference. `package/` in a relative value is an ordinary subdirectory, not another archive prefix. Backslashes never become separators. HTML entities were already decoded once by extraction and are not decoded again here.

## Limits and invariants

The reference is expected to come from bounded HTML extraction. This module does not parse HTML or discover document-level `<base>` information. Resolution describes the referring-file-relative logical target only. A later document-aware caller must handle base semantics before treating that target as package-local evidence. No base URL, runtime routes, redirects, directory indexes, or template language are inferred.

UNKNOWN is not PASS. SKIPPED is not package-local validation success. RESOLVED means only that a target path was derived; it says nothing about existence or runtime behavior. FOUND/MISSING, archive lookup, and scanner composition belong to later milestones.

Run `npm test`, `npm run typecheck`, and `npm run build`. Resolution tests cover the acceptance examples, classification categories, bounded traversal, suffix removal, literal percent encoding, Unicode/case preservation, and unchanged extraction evidence.
