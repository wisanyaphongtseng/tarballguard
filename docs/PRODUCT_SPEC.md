# B08 Product Specification

## Product

npm Packed Web-Asset Integrity Preflight

## One-Line Description

A browser-local checker for npm `.tgz` artifacts that finds literal HTML asset references pointing to files that were not actually packed.

## Problem

A repository can contain all required files while the final npm package does not.

Causes include:

- `package.json` `files`
- `.npmignore`
- build configuration
- copy steps
- release pipeline mistakes

This can create packages where an HTML file is included but an asset referenced by that HTML file is absent.

Example:

Packed artifact:

```text
package/
├─ index.html
└─ style.css
```

`index.html`:

```html
<script src="./app.js"></script>
```

`app.js` is not present in the actual package.

The checker should report this before publish.

## Target User

npm package maintainers who ship HTML or static web assets inside their package.

## v0 User Flow

1. Open website.
2. Drop `.tgz`.
3. Package is analyzed locally.
4. Optionally enter required files.
5. View findings.
6. Optionally copy/export evidence.

No account is required.

## Finding States

### FOUND

The literal relative target resolves to a file present in the archive.

### MISSING

The reference can be confidently resolved within the package but the target is absent.

### UNKNOWN

The tool sees the reference but cannot safely decide whether the target should be package-local.

### SKIPPED

The reference is intentionally outside the supported v0 scope.

UNKNOWN and SKIPPED must never silently become PASS.

## v0 Supported HTML

Inspect literal values from:

```html
<script src="">
<link href="">
<img src="">
```

## Examples

### Supported

```html
<script src="./app.js"></script>
<img src="../images/logo.svg">
<link href="style.css">
```

### Not confidently package-local

```html
<script src="/assets/app.js"></script>
<script src="https://cdn.example.com/app.js"></script>
```

These should not be treated as missing package files unless the resolution semantics are known.

## Required Files

The user can provide expected package paths.

Example:

```text
dist/index.html
dist/app.js
dist/style.css
```

Each must exist in the packed artifact.

If the archive contains no supported HTML and no required-file intent was provided, display:

> This artifact could not be audited under the currently supported checks.

Do not display a clean/pass result.

## Non-Goals

The v0 does not guarantee that an npm package works at runtime.

It does not execute package code.

It does not replace integration or smoke tests.

It does not validate dynamic resource generation.

It does not attempt complete JavaScript/CSS dependency analysis.

## Privacy

All package inspection is browser-local.

The package itself is never uploaded.

## Initial Public Experiment

Maximum development before public launch:

3 working days.

After launch, observe usage for 30 calendar days without expanding scope.

The experiment exists to learn whether real maintainers use the checker on their own artifacts and later releases.

It is not evidence that a commercial SaaS business already exists.