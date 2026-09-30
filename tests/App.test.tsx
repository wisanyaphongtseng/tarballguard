import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import App from '../src/App';

test('renders the bootstrap shell without offering package scanning', () => {
  const html = renderToStaticMarkup(<App />);

  expect(html).toContain('<h1>npm Packed Web-Asset Integrity Preflight</h1>');
  expect(html).toContain('Package scanning is not available yet.');
  expect(html).not.toContain('<input');
});
