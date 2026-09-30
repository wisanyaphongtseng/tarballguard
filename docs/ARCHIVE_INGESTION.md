# Archive ingestion — Day 1 Milestone 1

`src/engine/archive.ts` exposes the browser-local boundary:

```ts
ingestArchive(input: ArrayBuffer | File, overrides?: Partial<ArchiveLimits>): Promise<ArchiveIndex>
```

The index contains regular files sorted by package-relative path using code-unit ordering. Each file has `path`, `size`, and `bytes`. Directories count toward the entry limit but are not returned as files. The result includes `entryCount` and `decompressedBytes`. File metadata and the result array are frozen; payload byte arrays remain mutable caller-owned data. No audit/pass result is produced by this milestone.

## Limits

Defaults are 20 MiB compressed input, 100 MiB decompressed output, 10 MiB per file, and 10,000 entries. Override `maxCompressedBytes`, `maxDecompressedBytes`, `maxFileBytes`, and `maxEntries` with positive safe integers. Omit a key to use its default; an explicit `undefined` value is invalid and produces `INVALID_LIMITS`. Unknown keys and invalid values are rejected. Decompressed limits include headers, padding, and trailing zero blocks. Native decompression can allocate an output chunk before the application receives it; the application checks each chunk before retaining it. This is a byte/entry bound, not a hard browser memory quota or wall-clock timeout.

Input size is checked before decompression. ArrayBuffer input is snapshotted into a Blob; File input is streamed. The reader retains one output chunk and bounded file payloads, rather than a second complete decompressed TAR buffer. All file bytes are retained under the total decompressed limit for later consumers. Nothing is written to disk, fetched, uploaded, rendered, or executed by ingestion.

## Supported TAR scope

Only POSIX USTAR regular files (type `0` or NUL) and directories (type `5`) are supported. USTAR prefix fields are supported. Links, devices, sparse files, PAX records, GNU long-name records, GNU-format headers, and other extensions or formats reject the archive explicitly. PAX local (`x`) and global (`g`) headers produce `UNSUPPORTED_TAR` with the message: "PAX extended headers are unsupported (used for non-ASCII or long filenames)." No PAX path overrides are applied.

Real npm output uses PAX for non-ASCII filenames such as `café.svg`, for name components that cannot fit the USTAR prefix/name split, and for paths exceeding USTAR field capacities. Those otherwise valid npm packages are currently unsupported. Raw UTF-8 names in ordinary USTAR headers can be read, but this does not provide Unicode filename support for npm-generated artifacts. Long ASCII paths that fit the USTAR prefix/name fields remain supported.

Entries must lie under `package/`. A leading `./`, repeated separators, and `.` segments are normalized. The `package/` prefix is stripped exactly once. Paths are case-sensitive and never URL-decoded. Unicode NFC and NFD spellings are distinct; no Unicode normalization is applied. This logical archive index does not model case-insensitive or normalization-sensitive filesystem extraction.

Absolute paths, colons, backslashes, ASCII C0 controls, DEL, and every `..` segment are rejected, including traversal that would remain within the root. Rejecting every colon is a deliberate conservative choice, even for otherwise valid names such as `dist/a:b.css`. Duplicate canonical paths and file/directory conflicts reject the entire archive. Other Unicode controls, including C1 and bidi characters, can occur in raw USTAR names. Future UI must display paths as escaped text, visibly escaping control and bidi characters; never insert paths or package HTML as markup. UI implementation remains outside this milestone.

Header checksums, octal numeric fields, UTF-8 path fields, payload lengths, zero padding, and two zero end blocks are validated. Only block-aligned zero data may follow end markers. The gzip stream is drained to EOF before returning, so corrupt CRCs and truncated trailers cannot yield a successful index. Unsafe or malformed input throws `ArchiveError` with a stable `code`; no partial index is returned. Early rejection cancels decompression.

Source read exceptions named `NotReadableError` or `NotFoundError` produce `READ_FAILED`, so an unreadable or unavailable File is not described as corrupt gzip. Invalid or truncated gzip continues to produce `INVALID_GZIP`.

## Verification and fixtures

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests use deterministic in-memory USTAR/gzip builders for unsafe paths and malformed inputs. The checked-in `tests/fixtures/b08-archive-fixture-1.0.0.tgz` independently checks compatibility with actual npm output. Its source is `tests/fixtures/npm-package/`; regenerate there with `npm pack --ignore-scripts --pack-destination ..`. No lifecycle scripts are run.

`tests/fixtures/b08-unicode-archive-fixture-1.0.0.tgz` is actual npm output containing `café.svg`. Its source is `tests/fixtures/npm-unicode-package/`; regenerate with the same command in that directory. Its test asserts explicit PAX rejection, not successful Unicode indexing.

HTML scanning, required-file checks, worker orchestration, and UI integration are outside this milestone.
