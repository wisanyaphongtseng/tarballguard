# HTML literal-reference extraction — Day 1 Milestone 3

`src/engine/html-references.ts` exposes a synchronous, pure parser boundary:

```ts
extractHtmlReferences(input: string | Uint8Array): readonly HtmlReference[]
```

The caller selects a supported HTML file and supplies its content or ingested file bytes. This module does not select filenames, read an archive, access its index, or attach a referring filename. It returns frozen evidence records and a frozen array:

```ts
interface HtmlReference {
  readonly tag: 'script' | 'link' | 'img';
  readonly attribute: 'src' | 'href';
  readonly value: string;
  readonly location?: { readonly line: number; readonly column: number };
}
```

## Parser and dependency choice

The direct runtime dependency is pinned `parse5@8.0.1`, with `entities@8.1.0` locked transitively. parse5 provides standards-based HTML tree correction, attribute decoding, TypeScript declarations, and source locations. It parses into plain JavaScript objects without browser DOM APIs. This avoids handwritten HTML parsing and detached browser documents that could introduce resource-loading behavior. The selected parser entry and its dependencies require no Node built-ins, allowing a static browser bundle.

## Extraction semantics

Only HTML-namespace `script[src]`, `link[href]`, and `img[src]` are extracted. Tag and attribute names are lowercase under HTML parsing rules. All link `href` values are included regardless of `rel`. Missing target attributes produce no record; empty or valueless attributes produce a record with `value: ''`. The first duplicate attribute on an element wins under HTML rules. Separate source elements remain separate records, even when their values match.

Records follow source attribute order, including when parser tree correction moves elements. Literal HTML inside `template` content is included, without evaluating templates. Parsing uses `scriptingEnabled: true`: this is a syntax flag, not script execution. `noscript` contents are therefore treated as text. Foreign SVG/MathML elements are outside the supported scope, although HTML elements at HTML integration points remain eligible.

`value` is the attribute string already decoded by parse5. HTML character references are decoded exactly once: `a?x=1&amp;y=2` becomes `a?x=1&y=2`; `&amp;amp;` becomes `&amp;`, not `&`. There is no second entity decoding, URL decoding, trimming, path normalization, query/fragment removal, or target classification. Normal HTML input preprocessing still applies, including newline normalization and parser handling of null characters. Raw source spelling and quote style are not returned.

Remote URLs, root-relative URLs, percent escapes, traversal-looking paths, query strings, fragments, and expressions such as `{{ asset }}` remain evidence strings. Their interpretation belongs to the later resolver. Attribute bindings such as `:src`, `[src]`, and `data-src` are not literal `src` attributes and are not inspected. Inline JavaScript, CSS, `srcset`, comments, and fake tags in script/style/text-only content are not scanned.

## Source locations

When parse5 supplies the target attribute location, `location` points to the first character of its attribute name in the decoded input text. Line and column are one-based and retain parse5's source-coordinate conventions. Locations are not computed from decoded attribute values, so entity expansion does not shift them. If no reliable attribute location exists, the property is omitted; no synthetic location is invented. Records without locations sort after located records in traversal order.

Byte input is decoded as strict UTF-8. An initial UTF-8 BOM is removed by `TextDecoder`; byte-input locations therefore refer to the decoded text without that BOM. String input is parsed as supplied. Locations are not byte offsets and do not include an archive filename.

## Bounds and errors

`MAX_HTML_BYTES` is a fixed 1 MiB per HTML input, below ingestion's default 10 MiB file cap. No prior HTML-specific cap existed. Both input forms are checked before parsing; strings are measured by UTF-8 encoded byte length, with an early character-length rejection before allocating an encoded copy. Byte views are checked by their own `byteLength`, not their backing buffer size. Empty input is valid and returns an empty array without an audit/pass result.

Invalid input, oversize HTML, and invalid UTF-8 throw `HtmlExtractionError` with codes `INVALID_INPUT`, `HTML_TOO_LARGE`, and `INVALID_UTF8`. Ordinary malformed HTML uses standards-based recovery rather than failing the whole file. This is not an HTML validity checker. Iterative tree traversal avoids application recursion overflow. The byte cap bounds input size; it is not a hard memory quota or parsing-time guarantee.

Parsing never renders markup, executes scripts, evaluates attributes, or loads resources. Future consumers must render evidence as escaped text. No UI, worker, telemetry, resolver, finding statuses, or archive-format changes are included.

## Verification

`tests/html-references.test.ts` covers the three-reference acceptance example, HTML syntax variants, recovery, tree correction, duplicates, character references, locations, byte decoding, exact size limits, invalid inputs, deep nesting, and inert parsing. Security tests use Node with forbidden browser/network APIs and an inline-script execution sentinel.

Run `npm test`, `npm run typecheck`, and `npm run build`.
