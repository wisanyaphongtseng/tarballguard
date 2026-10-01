import { sourceRepositoryUrl } from './source-link';

export function ChecksOverview() {
  return <section className="checks-overview" aria-labelledby="checks-heading">
    <h2 id="checks-heading">What it checks</h2>
    <p>HTML packed inside the npm artifact, checked against the actual <code>.tgz</code> contents.</p>
    <ul>
      <li>Literal relative <code>{'<script src>'}</code></li>
      <li>Literal relative <code>{'<link href>'}</code></li>
      <li>Literal relative <code>{'<img src>'}</code></li>
      <li>Optional required package files</li>
    </ul>
    <p className="help">Checks packed-file presence, not whether your package works at runtime.</p>
  </section>;
}

export function LaunchNotes({ sourceUrl = import.meta.env.VITE_SOURCE_REPOSITORY_URL }: { sourceUrl?: string }) {
  const repository = sourceRepositoryUrl(sourceUrl);
  return <footer className="launch-notes" aria-labelledby="about-heading">
    <h2 id="about-heading">About this check</h2>
    <section aria-labelledby="pack-heading">
      <h3 id="pack-heading">How to get a .tgz</h3>
      <p>In your package directory, run <code>npm pack</code>. Select the actual <code>.tgz</code> it produces above.</p>
      <p className="help">To preview which files would be packed, run <code>npm pack --dry-run</code>.
        A dry run does not create the archive needed for inspection. The scanner does not run these commands.</p>
    </section>
    <section aria-labelledby="unchecked-heading">
      <h3 id="unchecked-heading">What it doesn't check</h3>
      <p>Runtime-generated paths, JavaScript imports, CSS dependency graphs, virtual routes,
        external URLs, install/runtime behavior, or whether the package works at runtime.</p>
    </section>
    <section id="privacy" aria-labelledby="privacy-heading">
      <h3 id="privacy-heading">Privacy</h3>
      <div className="privacy-columns"><div><h4>Package data</h4><p>Package processing occurs locally in your browser. Package contents are not uploaded.
        Package code is not executed. Install scripts are not run.</p></div>
      <div><h4>Coarse usage metrics</h4><p>Coarse anonymous usage events may be sent to PostHog. Events contain no filenames, paths,
        package contents, reference values, or required-file values. A random browser-local identifier
        may be used to estimate repeat usage. Ownership answers and coarse HTML-check flags may be sent;
        versions, hashes and error text are never sent. A required-policy comparison digest stays only in this browser.</p></div></div>
    </section>
    <section id="limitations" aria-labelledby="limitations-heading">
      <h3 id="limitations-heading">Current v0 limitations</h3>
      <ul>
        <li>Some TAR, PAX, and GNU variants are unsupported. Some Unicode or very long npm paths may therefore be rejected.</li>
        <li>Unusual HTML structures may be conservatively rejected to keep processing bounded.</li>
        <li>Root-relative or runtime-dependent paths may be UNKNOWN.</li>
        <li>Relative references affected by <code>{'<base href>'}</code> and percent-bearing relative URL paths are UNKNOWN.</li>
        <li>Static checks do not replace integration or smoke tests.</li>
      </ul>
      <p className="help">Experimental v0. A result describes only the checks performed.</p>
    </section>
    <section id="source" aria-labelledby="source-heading">
      <h3 id="source-heading">Source code</h3>
      <p>TarballGuard is open source. Review the implementation and local-processing design on GitHub.</p>
      <p><a href={repository} rel="noreferrer">View source on GitHub</a></p>
    </section>
  </footer>;
}
