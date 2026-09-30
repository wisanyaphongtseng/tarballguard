# Bounded HTML processing of untrusted packages

The archive byte/entry limits alone do not bound parser work or findings. This milestone adds conservative structural-work filtering, reference budgets, and reusable package lookup without UI, workers, dependencies, or archive-format changes.

## Inclusive limits

| Limit | Value |
| --- | --- |
| HTML input bytes | 1 MiB, unchanged |
| Markup items (`<` encountered by the preflight) | 25,000 |
| Single tag span | 65,536 UTF-16 code units |
| Attribute-like entries per tag | 256 |
| Approximate structural depth | 256 |
| Extracted references per HTML | 5,000 |
| Retained HTML findings per package | 25,000 |

Constants are in `html-preflight.ts`, `html-references.ts`, and `package-audit.ts`. Exceeding a limit is an explicit typed error/coverage gap, not a definite missing asset. The preflight does not parse HTML semantically, decode references, construct a token list, render, or execute anything.

## Linear structural preflight

The preflight advances a cursor through input once. It counts encountered markup starts and scans tag-like spans with a small attribute/quote state machine. Each region is visited a constant number of times. There is no backtracking or growing token list. Runtime is O(n); auxiliary state is O(1), with temporary tag-name text bounded by the tag cap.

Comment handling is intentionally conservative. After `<!--`, an immediate `>` or `->` is rejected. The comment body is scanned forward without allocating substrings; its first `--` must be the standard `-->` terminator. Any other internal `--` (including `--!>` and extra hyphens), any `<`, or a missing terminator, is rejected before parse5 with `HTML_COMPLEXITY_LIMIT` and an explicit comment-safety reason. Ordinary text inside accepted standard comments remains inert and does not count as markup items. Markup after the accepted terminator is counted normally.

This deliberately rejects unusual or ambiguous comments instead of reproducing HTML comment recovery rules. In particular, `<!-->` and `<!--->` cannot hide subsequent active markup, and `--!>` cannot terminate an exempted region early. Rejecting `<` also prevents an apparent comment inside script/style or other text contexts from hiding an enclosing element's end tag and subsequent active markup. Comments containing harmless markup-looking text, nested openers, internal double hyphens, or no terminator may be harmless to parse5 but are still coverage limitations in v0. Even a single literal `<` in comment text is conservatively rejected. The preflight is not a full HTML parser and does not claim complete HTML-spec equivalence. Rejected files are explicitly unscanned coverage gaps and never count as cleanly audited.

Attribute-like names are counted before values are decoded, including duplicate names. Quotes after `=` protect spaces and `>` inside attribute values. This is a conservative work count, not a replacement HTML grammar. A depth counter increases for opening non-void tag-like items and decreases for closing tag-like items. Known HTML void tags do not increase it. No matching-tag stack or HTML tree correction is attempted; mismatched closing tags can reduce the counter. It is an approximate work guard, not an exact nesting guarantee.

Raw script/style text is not specially tokenized by this filter. Tag-looking text there can count toward conservative limits, as can malformed markup; unknown self-closing non-void names can increase depth. Valid but unusually complex inputs may therefore be rejected. Normal malformed-but-recoverable HTML within these limits is still parsed by parse5. Limits reject both reviewed pathological inputs before parse5 is invoked, but they do not prove that every possible parser slowdown is eliminated.

## Reference and coverage behavior

Extraction checks reference count before appending the next result. The 5,001st reference raises `HTML_REFERENCE_LIMIT`; no partial file result is returned. Parse5's tree is still built first, under byte and structural limits. Package composition retains at most 25,000 HTML findings; all statuses consume that budget. An overflowing file is discarded whole with `PACKAGE_REFERENCE_LIMIT`, while previous files' findings remain. At most one bounded per-file finding array is temporary beyond retained package findings.

Structural, per-file reference, package reference, byte, and UTF-8 failures become explicit per-file coverage issues. They are separate from UNKNOWN reference counts. Existing outcome precedence remains: definite MISSING wins; zero checked assertions is NOT_AUDITABLE; checks plus any unknown/coverage gap is CHECKED_WITH_UNKNOWNS. A rejected file cannot produce CHECKED_NO_ISSUES. Unexpected errors still propagate.

The HTML budget does not cap user-declared required-file policy findings, archive payload retention, parser-node memory, or total output string bytes independently. Those retain existing caller/archive/input constraints. No hard real-time deadline, hard browser memory quota, or total CPU guarantee is claimed. Synchronous parsing remains, and aggregate work across many admissible HTML files is still possible under the archive caps.

## Lookup reuse and probes

Audit creates one internal Map from indexed regular-file paths to files, then reuses it for both HTML file retrieval and target membership. No per-file archive array search or Set construction remains. Public APIs and frozen result semantics stay unchanged. Getter instrumentation checks metadata reads rather than relying on unstable timing assertions.

Run `node --max-old-space-size=256 tests/hardening-probe.mjs` for the four reproduction probes. This harness bundles engine modules in memory and writes no output files. One measured run on this workspace:

| Probe | Before | After |
| --- | --- | --- |
| 90,000 nested divs, 990,000 bytes | Reviewer: about 70 s | HTML_COMPLEXITY_LIMIT, 2.68 ms |
| 100,000 attributes, 688,895 bytes | Reviewer: about 49 s | HTML_COMPLEXITY_LIMIT, 3.48 ms |
| 30 HTML files × 90,000 img references | Reviewer: 256 MiB heap exhaustion | 30 coverage gaps, 0 findings, 159.64 ms; observed heap 41.26 MiB |
| 10,000 empty HTML files | Local instrumented run: 15.6 s; 150,025,000 path reads | 35.23 ms; 20,000 path reads |

Reviewer timings are supplied evidence, not repeated local baseline measurements. After timings are observations, not guarantees or test thresholds. The many-reference probe ingests actual generated gzip/TAR bytes, each HTML below 1 MiB. The empty-file probe uses a constructed index and instrumented path getters.

Run `npm test`, `npm run typecheck`, and `npm run build` for regression verification.

`tests/html-comment-safety.test.ts` instruments `parse5.parse()` directly. It verifies zero calls for the 40,000-nesting reviewer reproduction, its `<!--->` and `--!>` variants, and comment-hidden 90,000-tag and 100,000-attribute inputs. These tests also cover accepted standard comments, conservative rejections, markup after comments, and package outcome precedence. Probe timings are printed as observations, never correctness thresholds.
