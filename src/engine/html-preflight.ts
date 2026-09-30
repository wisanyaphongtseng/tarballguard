export const MAX_MARKUP_ITEMS = 25000;
export const MAX_TAG_CHARS = 64 * 1024;
export const MAX_ATTRIBUTES_PER_TAG = 256;
export const MAX_STRUCTURAL_DEPTH = 256;

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);
const space = (char: string) => char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f';

/** Linear conservative work filter, not an HTML grammar or validity check. */
export function htmlComplexityViolation(html: string): string | undefined {
  let items = 0;
  let depth = 0;
  for (let i = 0; i < html.length; i++) {
    if (html[i] !== '<') continue;
    if (++items > MAX_MARKUP_ITEMS) return 'HTML exceeds the markup-item limit.';
    if (html.startsWith('<!--', i)) {
      // Only exempt a conservative subset of comments. Abrupt/recovery endings
      // can expose markup to parse5 before a later literal "-->" terminator.
      let position = i + 4;
      if (html[position] === '>' || html.startsWith('->', position)) {
        return 'HTML contains an unsafe or ambiguous comment.';
      }
      for (; position < html.length; position++) {
        // In raw-text contexts, an apparent comment may contain an enclosing
        // element's end tag. Do not exempt any region containing markup starts.
        if (html[position] === '<') return 'HTML contains an unsafe or ambiguous comment.';
        if (!html.startsWith('--', position)) continue;
        if (html[position + 2] !== '>') return 'HTML contains an unsafe or ambiguous comment.';
        break;
      }
      if (position === html.length) return 'HTML contains an unterminated comment.';
      i = position + 2;
      continue;
    }
    const start = i;
    const closing = html[i + 1] === '/';
    let position = i + (closing ? 2 : 1);
    const nameStart = position;
    while (position < html.length && /[a-z0-9:-]/iu.test(html[position])) {
      if (position - start + 1 > MAX_TAG_CHARS) return 'HTML exceeds the single-tag character limit.';
      position++;
    }
    const name = html.slice(nameStart, position).toLowerCase();
    let attributes = 0;
    let state: 'before' | 'name' | 'after' | 'value' | 'unquoted' = 'before';
    let quote = '';
    for (i = position; i < html.length; i++) {
      if (i - start + 1 > MAX_TAG_CHARS) return 'HTML exceeds the single-tag character limit.';
      const char = html[i];
      if (quote) { if (char === quote) { quote = ''; state = 'before'; } continue; }
      if (char === '>') break;
      if (state === 'value') {
        if (space(char)) continue;
        if (char === '"' || char === "'") { quote = char; continue; }
        state = 'unquoted';
      } else if (state === 'unquoted') {
        if (space(char)) state = 'before';
      } else if (state === 'name') {
        if (char === '=') state = 'value';
        else if (space(char)) state = 'after';
      } else if (state === 'after' && char === '=') {
        state = 'value';
      } else if (!space(char) && char !== '/') {
        if (++attributes > MAX_ATTRIBUTES_PER_TAG) return 'HTML exceeds the attributes-per-tag limit.';
        state = 'name';
      }
    }
    // This counter is deliberately approximate: no tag stack, tree correction, or grammar.
    if (name) {
      if (closing) depth = Math.max(0, depth - 1);
      else if (!voidTags.has(name)) {
        if (++depth > MAX_STRUCTURAL_DEPTH) return 'HTML exceeds the structural-depth limit.';
      }
    }
  }
  return undefined;
}
