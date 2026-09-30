import { defaultTreeAdapter, parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import { htmlComplexityViolation } from './html-preflight';

export interface HtmlReference {
  readonly tag: 'script' | 'link' | 'img';
  readonly attribute: 'src' | 'href';
  readonly value: string;
  readonly location?: { readonly line: number; readonly column: number };
}

export const MAX_HTML_BYTES = 1024 * 1024;
export const MAX_REFERENCES_PER_HTML = 5000;
export type HtmlCoverageErrorCode = 'HTML_TOO_LARGE' | 'INVALID_UTF8' | 'HTML_COMPLEXITY_LIMIT' | 'HTML_REFERENCE_LIMIT';

export class HtmlExtractionError extends Error {
  constructor(
    public readonly code: 'INVALID_INPUT' | HtmlCoverageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HtmlExtractionError';
  }
}

/** Pure evidence extraction. Values are HTML-parser-decoded, not URL-decoded. */
export function extractHtmlReferences(input: string | Uint8Array): readonly HtmlReference[] {
  if (typeof input !== 'string' && !(input instanceof Uint8Array)) {
    throw new HtmlExtractionError('INVALID_INPUT', 'Expected HTML text or UTF-8 bytes.');
  }
  // Reject obviously oversized strings before allocating an encoded copy.
  if ((typeof input === 'string' ? input.length : input.byteLength) > MAX_HTML_BYTES ||
      (typeof input === 'string' && new TextEncoder().encode(input).byteLength > MAX_HTML_BYTES)) {
    throw new HtmlExtractionError('HTML_TOO_LARGE', 'HTML exceeds the byte limit.');
  }
  let html: string;
  try {
    html = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    throw new HtmlExtractionError('INVALID_UTF8', 'HTML bytes must be valid UTF-8.');
  }

  const violation = htmlComplexityViolation(html);
  if (violation) throw new HtmlExtractionError('HTML_COMPLEXITY_LIMIT', violation);
  const document = parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: true });
  const stack: DefaultTreeAdapterTypes.Node[] = [document];
  const references: { reference: HtmlReference; offset: number }[] = [];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (defaultTreeAdapter.isElementNode(node)) {
      const tag = node.tagName;
      if (node.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
          (tag === 'script' || tag === 'link' || tag === 'img')) {
        const attribute = tag === 'link' ? 'href' : 'src';
        const target = node.attrs.find(item => item.name === attribute && !item.namespace);
        if (target) {
          if (references.length === MAX_REFERENCES_PER_HTML) {
            throw new HtmlExtractionError('HTML_REFERENCE_LIMIT', 'HTML exceeds the reference limit.');
          }
          const source = node.sourceCodeLocation?.attrs?.[attribute];
          references.push({
            offset: source?.startOffset ?? Number.POSITIVE_INFINITY,
            reference: Object.freeze({
              tag, attribute, value: target.value,
              ...(source ? { location: Object.freeze({ line: source.startLine, column: source.startCol }) } : {}),
            }),
          });
        }
      }
      // Template contents live in a separate fragment, not childNodes.
      if (tag === 'template' && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
        stack.push(defaultTreeAdapter.getTemplateContent(node as DefaultTreeAdapterTypes.Template));
      }
    }
    if ('childNodes' in node) {
      for (let position = node.childNodes.length - 1; position >= 0; position--) {
        stack.push(node.childNodes[position]);
      }
    }
  }
  // Tree correction (for example, foster parenting) can differ from source order.
  references.sort((a, b) => a.offset - b.offset);
  return Object.freeze(references.map(item => item.reference));
}
