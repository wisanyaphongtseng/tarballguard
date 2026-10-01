import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import App from '../src/App';

test('explains packed-artifact scope and local privacy', () => {
  const html = renderToStaticMarkup(<App />);

  expect(html).toContain('<p class="product-name">TarballGuard</p>');
  expect(html).toContain('<p class="product-subtitle">npm Packed Web-Asset Preflight</p>');
  expect(html).not.toMatch(/\bB08\b|Source repository link pending/iu);
  expect(html).toContain('Check what you&#x27;re actually publishing to npm.');
  expect(html).toContain('Your package stays in this browser.');
  expect(html).toContain('Your package is not uploaded.');
  expect(html).toContain('does not guarantee that the package works at runtime');
});

test('public onboarding states scope, npm pack guidance, and limitations', () => {
  const html = renderToStaticMarkup(<App />);
  for (const copy of ['What it checks', 'What it doesn&#x27;t check', 'npm pack', 'npm pack --dry-run',
    'does not create the archive', 'JavaScript imports', 'CSS dependency graphs', 'virtual routes',
    'Package contents are not uploaded', 'Package code is not executed', 'Install scripts are not run',
    'TAR, PAX, and GNU', 'Unicode or very long', 'conservatively rejected', 'Root-relative', 'integration or smoke tests']) {
    expect(html).toContain(copy);
  }
  expect(html).toContain('&lt;script src&gt;');
  expect(html).toContain('&lt;link href&gt;');
  expect(html).toContain('&lt;img src&gt;');
});

test('synthetic sample is labelled and public page contains no developer placeholders or guarantees', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('Run sample scan');
  expect(html).toContain('No third-party package code');
  expect(html).toContain('data-input-kind="none"');
  expect(html).not.toMatch(/safe to publish|\bPASS\b|Milestone|Detailed report UI coming next|developer worker smoke/iu);
});

test('initial input controls are labelled and scan is disabled', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('accept=".tgz"');
  expect(html).toContain('Upload npm package archive');
  expect(html).toContain('Required package files');
  expect(html).toContain('for="required-files"');
  expect(html).toContain('aria-describedby="required-help"');
  expect(html).toMatch(/<button type="submit"[^>]*disabled=""[^>]*>Scan package<\/button>/u);
  expect(html).not.toContain('Cancel scan');
});

test('office layout keeps one main workflow and explicit package-handling badges', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html.match(/<main>/gu)).toHaveLength(1);
  expect(html.match(/<h1>/gu)).toHaveLength(1);
  expect(html).toContain('<header class="top-bar">');
  expect(html).toContain('aria-label="Package handling"');
  expect(html).toContain('Browser-local processing');
  expect(html).toContain('No package uploads');
  expect(html).toContain('Package code is not executed');
});

test('status is accessible and developer smoke UI is absent', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
  expect(html).toContain('Choose a package');
  expect(html).not.toContain('Run developer worker smoke test');
});
