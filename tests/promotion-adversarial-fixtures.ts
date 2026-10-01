// Deterministic safe fixtures from the 2026-10-01 audit. Never install or execute them.
import { tarFixture, tgzFixture, gzipFixture, checksum, writeField } from './archive-fixture';
import type { FixtureEntry } from './archive-fixture';
import type { ArchiveLimits } from '../src/engine/limits';
export interface AuditFixture {
  name: string; entries?: FixtureEntry[]; bytes?: ArrayBuffer; required?: string[];
  limits?: Partial<ArchiveLimits>; error?: string; expect?: string[];
  outcome?: string; coverage?: string; desired?: string;
}
const file = (path: string, content: string | Uint8Array='') => ({path:`package/${path}`, content});
const html = (text: string | Uint8Array, path='dist/index.html') => file(path,text);
export const cases: AuditFixture[] = [
 {name:'valid-script-css-img', entries:[html('<script src="./app.js"></script><link href="style.css"><img src="../img/logo.svg">'),file('dist/app.js'),file('dist/style.css'),file('img/logo.svg')],expect:['FOUND','FOUND','FOUND']},
 {name:'missing-script-css-img', entries:[html('<script src="./app.js"></script><link href="style.css"><img src="../img/logo.svg">')],expect:['MISSING','MISSING','MISSING']},
 {name:'absent-entry-no-policy',entries:[file('app.js')],outcome:'NOT_AUDITABLE'},
 {name:'absent-entry-with-policy',entries:[file('app.js')],required:['dist/index.html'],outcome:'ISSUES_FOUND'},
 {name:'nested-query-hash',entries:[html('<script src="../shared/app.js?v=1#boot"></script>','dist/pages/index.html'),file('dist/shared/app.js')],expect:['FOUND']},
 {name:'plain-parent-outside',entries:[html('<img src="../../../outside.svg">')],expect:['UNKNOWN']},
 {name:'plain-unicode-space-case',entries:[html('<img src="café.svg"><img src="hello world.svg"><img src="Logo.svg"><img src="logo.svg">'),file('dist/café.svg'),file('dist/hello world.svg'),file('dist/Logo.svg')],expect:['FOUND','FOUND','FOUND','MISSING']},
 {name:'encoded-space-existing',entries:[html('<script src="hello%20world.js"></script>'),file('dist/hello world.js')],expect:['UNKNOWN'],desired:'UNKNOWN without URL support; runtime target exists'},
 {name:'encoded-unicode-existing',entries:[html('<img src="caf%C3%A9.svg">'),file('dist/café.svg')],expect:['UNKNOWN'],desired:'UNKNOWN without URL support; runtime target exists'},
 {name:'encoded-percent-literal-present',entries:[html('<script src="hello%20world.js"></script>'),file('dist/hello%20world.js')],expect:['UNKNOWN'],desired:'UNKNOWN without URL support; runtime requests hello world.js which is absent'},
 {name:'encoded-dot-parent-existing',entries:[html('<script src="%2e%2e/app.js"></script>','dist/pages/index.html'),file('dist/app.js')],expect:['UNKNOWN'],desired:'UNKNOWN without URL support; URL dot-segment target exists'},
 {name:'encoded-dot-escape-literal-present',entries:[html('<script src="%2e%2e/%2e%2e/outside.js"></script>','dist/index.html'),file('dist/%2e%2e/%2e%2e/outside.js')],expect:['UNKNOWN'],desired:'UNKNOWN; URL escapes logical package root'},
 {name:'malformed-percent-literal',entries:[html('<img src="bad%ZZ.svg">'),file('dist/bad%ZZ.svg')],expect:['UNKNOWN'],desired:'UNKNOWN if percent paths excluded'},
 {name:'local-base-target-existing',entries:[html('<base href="./assets/"><script src="app.js"></script>'),file('dist/assets/app.js')],expect:['UNKNOWN'],desired:'UNKNOWN without base support; base target exists'},
 {name:'local-base-wrong-target-present',entries:[html('<base href="./assets/"><script src="app.js"></script>'),file('dist/app.js')],expect:['UNKNOWN'],desired:'UNKNOWN without base support; base target is absent'},
 {name:'remote-base-relative',entries:[html('<base href="https://example.invalid/assets/"><script src="app.js"></script>')],expect:['UNKNOWN'],desired:'UNKNOWN/SKIPPED; reference is remote'},
 {name:'root-base-relative',entries:[html('<base href="/assets/"><img src="logo.svg">'),file('dist/logo.svg')],expect:['UNKNOWN'],desired:'UNKNOWN; web root mapping not proven'},
 {name:'base-target-only',entries:[html('<base target="_blank"><img src="logo.svg">'),file('dist/logo.svg')],expect:['FOUND']},
 {name:'remote-absolute-data-fragment-template',entries:[html('<script src="https://example.invalid/a.js"></script><img src="//example.invalid/a.svg"><img src="/assets/a.svg"><img src="data:image/png;base64,AAAA"><img src="#foo"><img src="{{ asset }}"><img src="?v=1">')],expect:['SKIPPED','SKIPPED','UNKNOWN','SKIPPED','SKIPPED','UNKNOWN','UNKNOWN']},
 {name:'malformed-html-duplicate-attr',entries:[html('<SCRIPT SRC=app.js src=absent.js></SCRIPT><p><IMG SRC="logo.svg"'),file('dist/app.js'),file('dist/logo.svg')],expect:['FOUND']},
 {name:'ignored-css-runtime-js-assets',entries:[html('<link href="style.css"><script>globalThis.__auditExecuted=true; import("missing-runtime.js");</script><style>body{background:url(missing-inline.svg)}</style>'),file('dist/style.css','@import "missing.css"; body{background:url(missing.svg)}')],expect:['FOUND']},
 {name:'ignored-comments-noscript-srcset-svg',entries:[html('<!-- inert comment --><noscript><img src="missing-noscript.svg"></noscript><img srcset="missing-srcset.svg 1x"><svg><image href="missing-svg.svg"/></svg>')],expect:[],outcome:'NOT_AUDITABLE'},
 {name:'unsafe-comment-coverage',entries:[html('<!-- <img src="missing.svg"> -->')],coverage:'HTML_COMPLEXITY_LIMIT'},
 {name:'deep-html-coverage',entries:[html('<div>'.repeat(257)+'</div>'.repeat(257))],coverage:'HTML_COMPLEXITY_LIMIT'},
 {name:'attribute-html-coverage',entries:[html('<img '+Array.from({length:257},(_,i)=>`a${i}="x"`).join(' ')+'>')],coverage:'HTML_COMPLEXITY_LIMIT'},
 {name:'reference-html-coverage',entries:[html('<img src="x">'.repeat(5001))],coverage:'HTML_REFERENCE_LIMIT'},
 {name:'oversize-html-coverage',entries:[html('x'.repeat(1048577))],coverage:'HTML_TOO_LARGE'},
 {name:'invalid-utf8-html-coverage',entries:[html(new Uint8Array([0xc0,0x80]))],coverage:'INVALID_UTF8'},
 {name:'xss-diagnostic-text',entries:[html('<script>globalThis.__auditExecuted=true</script><img src="&lt;img src=x onerror=globalThis.__auditExecuted=true&gt;.svg">'),file('dist/\u202eevil.svg')],expect:['MISSING']},
 {name:'tar-parent-traversal',entries:[{path:'package/../outside'}],error:'UNSAFE_PATH'},
 {name:'tar-absolute',entries:[{path:'/package/absolute'}],error:'UNSAFE_PATH'},
 {name:'tar-backslash',entries:[{path:'package/a\\b'}],error:'UNSAFE_PATH'},
 {name:'tar-rootless',entries:[{path:'not-package/a'}],error:'UNSAFE_PATH'},
 {name:'tar-symlink',entries:[{path:'package/a',type:'2',linkname:'../../outside'}],error:'UNSUPPORTED_TAR'},
 {name:'tar-hardlink',entries:[{path:'package/a',type:'1',linkname:'/outside'}],error:'UNSUPPORTED_TAR'},
 {name:'tar-duplicate-normalized',entries:[file('a'),file('./a')],error:'DUPLICATE_PATH'},
 {name:'tar-parent-file-conflict',entries:[file('a'),file('a/b')],error:'PATH_CONFLICT'},
 {name:'tar-file-directory-conflict',entries:[file('a/b'),file('a')],error:'PATH_CONFLICT'},
 {name:'tar-pax-unsupported',entries:[{path:'package/PaxHeader',type:'x'}],error:'UNSUPPORTED_TAR'},
 {name:'limit-file-tiny',entries:[file('a','x'.repeat(1025))],limits:{maxFileBytes:1024},error:'LIMIT_EXCEEDED'},
 {name:'limit-count-tiny',entries:Array.from({length:5},(_,i)=>file(`a${i}`)),limits:{maxEntries:4},error:'LIMIT_EXCEEDED'},
 {name:'limit-compressed-tiny',entries:[file('a')],limits:{maxCompressedBytes:10},error:'LIMIT_EXCEEDED'},
 {name:'limit-decompression-bounded-bomb',entries:[file('zeros',new Uint8Array(1024*1024))],limits:{maxDecompressedBytes:65536},error:'LIMIT_EXCEEDED'},
];
const mutate=(name: string, action: (tar: Uint8Array) => void, error='INVALID_TAR')=>{const tar=tarFixture([file('a','x')]);action(tar);cases.push({name,bytes:gzipFixture(tar),error});};
mutate('tar-checksum-malformed',tar=>{tar[10]^=1});
mutate('tar-size-nonoctal',tar=>{writeField(tar,124,12,'00000000009');checksum(tar.subarray(0,512));});
mutate('tar-name-data-after-nul',tar=>{tar[20]=1;checksum(tar.subarray(0,512));});
mutate('tar-padding-nonzero',tar=>{tar[513]=1;});
mutate('tar-end-block-nonzero',tar=>{tar[1536]=1;});
mutate('tar-header-invalid-utf8',tar=>{tar[8]=0xc0;checksum(tar.subarray(0,512));});
cases.push({name:'tar-truncated-payload',bytes:gzipFixture(tarFixture([file('a','x'.repeat(1024))]).subarray(0,1024)),error:'INVALID_TAR'});
const corrupt=new Uint8Array(tgzFixture([file('a')]));corrupt[corrupt.length-8]^=1;
cases.push({name:'gzip-bad-crc',bytes:corrupt.buffer,error:'INVALID_GZIP'});
const truncated=new Uint8Array(tgzFixture([file('a')]));cases.push({name:'gzip-truncated-footer',bytes:truncated.slice(0,-6).buffer,error:'INVALID_GZIP'});
cases.push({name:'package-reference-budget',entries:[...Array.from({length:6},(_,i)=>html('<img src="x">'.repeat(4500),`page${i}.html`)),file('x')],coverage:'PACKAGE_REFERENCE_LIMIT'});
for(const depth of [100,500,1000,2000])cases.push({name:`approx-depth-mismatch-${depth}`,entries:[html('<div></x>'.repeat(depth)+'<img src="x">'),file('dist/x')],expect:['FOUND']});
