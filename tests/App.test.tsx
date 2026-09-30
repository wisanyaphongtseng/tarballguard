import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import App from '../src/App';

test('explains packed-artifact scope and local privacy', () => {
  const html = renderToStaticMarkup(<App />);

  expect(html).toContain('npm Packed Web-Asset Preflight');
  expect(html).toContain('Check the npm package you are actually publishing.');
  expect(html).toContain('Your package stays in this browser.');
  expect(html).toContain('Your package is not uploaded.');
  expect(html).toContain('does not guarantee that the package works at runtime');
});

test('initial input controls are labelled and scan is disabled', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('accept=".tgz"');
  expect(html).toContain('for="required-files"');
  expect(html).toContain('aria-describedby="required-help"');
  expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Scan package<\/button>/u);
  expect(html).not.toContain('Cancel scan');
});

test('status is accessible and developer smoke UI is absent', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
  expect(html).toContain('Choose a package');
  expect(html).not.toContain('Run developer worker smoke test');
});
