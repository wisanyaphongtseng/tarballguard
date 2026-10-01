import { sourceRepositoryUrl } from './source-link';

export function ChecksOverview() {
  return <section className="checks-overview" aria-labelledby="checks-heading">
    <h2 id="checks-heading">What it checks</h2>
    <p>HTML packed inside the npm artifact, checked against the actual <code>.tgz</code> contents.</p>
    <ul>
      <li>Literal relative <code>{'<script src>'}</code>, <code>{'<link href>'}</code>, and <code>{'<img src>'}</code> references</li>
      <li>Optional required package files</li>
    </ul>
    <p className="help">Checks packed-file presence, not whether your package works.</p>
  </section>;
}

export function LaunchNotes({ sourceUrl = import.meta.env.VITE_SOURCE_REPOSITORY_URL }: { sourceUrl?: string }) {
  const repository = sourceRepositoryUrl(sourceUrl);
  return <footer className="launch-notes">
    <section aria-labelledby="pack-heading">
      <h2 id="pack-heading">How to get a .tgz</h2>
      <p>In your package directory, run <code>npm pack</code>. Select the actual <code>.tgz</code> it produces above.</p>
      <p className="help">To preview which files would be packed, run <code>npm pack --dry-run</code>.
        A dry run does not create the archive B08 needs. B08 does not run these commands.</p>
    </section>
    <section aria-labelledby="unchecked-heading">
      <h2 id="unchecked-heading">What it doesn't check</h2>
      <p>Runtime-generated paths, JavaScript imports, CSS dependency graphs, virtual routes,
        external URLs, install/runtime behavior, or whether the package works at runtime.</p>
    </section>
    <section aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">Privacy</h2>
      <p>Package processing occurs locally in your browser. Package contents are not uploaded by B08.
        Package code is not executed. Install scripts are not run.</p>
      <p>Coarse anonymous usage events may be sent to PostHog. Events contain no filenames, paths,
        package contents, reference values, or required-file values. A random browser-local identifier
        may be used to estimate repeat usage.</p>
    </section>
    <section id="limitations" aria-labelledby="limitations-heading">
      <h2 id="limitations-heading">Current v0 limitations</h2>
      <ul>
        <li>Some TAR, PAX, and GNU variants are unsupported. Some Unicode or very long npm paths may therefore be rejected.</li>
        <li>Unusual HTML structures may be conservatively rejected to keep processing bounded.</li>
        <li>Root-relative or runtime-dependent paths may be UNKNOWN.</li>
        <li>Static checks do not replace integration or smoke tests.</li>
      </ul>
      <p className="help">Experimental v0. A result describes only the checks B08 performed.</p>
    </section>
    <section aria-labelledby="source-heading">
      <h2 id="source-heading">Source</h2>
      {repository ? <p><a href={repository} rel="noreferrer">Source available for inspection</a>.</p>
        : <p className="help">Source repository link pending. It will be available here for inspection.</p>}
    </section>
  </footer>;
}
