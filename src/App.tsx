import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PackageScanClient } from './worker/client';
import { canScan, ScanWorkflow } from './ui/scan-workflow';
import { readableFileSize, visibleFileName } from './ui/file-display';
import { AuditReport } from './ui/AuditReport';
import { ChecksOverview, LaunchNotes } from './ui/Onboarding';
import { createBrowserMeasurement } from './measurement/experiment';
import type { ExperimentMeasurement } from './measurement/experiment';
import { ExperimentPrompts } from './ui/ExperimentPrompts';

const statusTitles = {
  idle: 'Choose a package', ready: 'Ready to scan', scanning: 'Scanning locally…',
  completed: 'Scan complete', error: 'Scan could not complete', cancelled: 'Scan cancelled',
};

export default function App({ measurement }: { measurement?: ExperimentMeasurement } = {}) {
  const [workflow] = useState(() => new ScanWorkflow(new PackageScanClient(), measurement ?? createBrowserMeasurement()));
  const state = useSyncExternalStore(workflow.subscribe, workflow.getSnapshot, workflow.getSnapshot);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => () => workflow.cancel(), [workflow]);

  return (
    <>
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="product-identity"><p className="product-name">TarballGuard</p><p className="product-subtitle">npm Packed Web-Asset Preflight</p></div>
          <nav className="top-bar-links" aria-label="About TarballGuard"><a href="#source">Source</a><a href="#privacy">Privacy</a></nav>
        </div>
      </header>
      <main>
        <header className="page-header">
          <p className="eyebrow">npm package release preflight</p>
          <h1>Check what you're actually publishing to npm.</h1>
          <p className="intro">Find HTML references that point to files missing from the final packed <code>.tgz</code>.</p>
          <ul className="trust-badges" aria-label="Package handling">
            <li>Browser-local processing</li><li>No package uploads</li><li>Package code is not executed</li>
          </ul>
          <p className="privacy"><strong>Your package stays in this browser.</strong> Runs locally in your browser. Your package is not uploaded.</p>
        </header>
        <form className={`scan-workspace ${state.phase}`} data-input-kind={state.inputKind ?? 'none'} onSubmit={event => { event.preventDefault(); void workflow.start(); }}>
          <div className="form-heading"><h2>Package scan</h2><p className="help">Inspect the packed artifact and optionally assert files that must be present.</p></div>
          <div className="input-panels">
            <section className="archive-input" aria-labelledby="package-label">
              <h3 id="package-label">Upload npm package archive</h3>
              <input ref={picker} type="file" accept=".tgz" hidden aria-label="Choose npm .tgz package"
                onChange={event => {
                  workflow.selectFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = '';
                }} />
              <button type="button" className={`drop-zone${dragging ? ' dragging' : ''}${state.file ? ' has-file' : ''}`}
                aria-describedby="package-help" onClick={() => picker.current?.click()}
                onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={event => {
                  event.preventDefault(); setDragging(false);
                  workflow.selectFiles(Array.from(event.dataTransfer.files));
                }}>
                <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 15v5h16v-5M12 16V4m-5 5 5-5 5 5" /></svg>
                <span className="drop-title">{state.file ? 'Drop another .tgz or choose a replacement' : 'Drop your .tgz here'}</span>
                {!state.file && <span className="choose-file">or choose a file</span>}
                <span>One npm package at a time</span>
              </button>
              <p id="package-help" className="help">Select the packed .tgz artifact. The archive is validated when you scan.</p>
              {state.file && <div className="selected-file">
                <div><strong className="filename">{state.inputKind === 'example' ? 'Synthetic sample.tgz' : visibleFileName(state.file.name)}</strong>
                  <span className="file-size">{readableFileSize(state.file.size)}</span>
                  {state.inputKind === 'example' && <span className="demo-note">Example package — synthetic demo, not your package.</span>}</div>
                <button type="button" onClick={() => workflow.removeFile()}>Remove file</button>
              </div>}
            </section>

            <section className="policy-input">
              <label htmlFor="required-files">Required package files <span className="optional">(optional)</span></label>
              <p id="required-help" className="help">List package-relative files that must exist in the packed artifact. One path per line.
                Blank lines are ignored; spaces in paths are kept exactly.</p>
              <textarea id="required-files" rows={4} spellCheck={false} autoCapitalize="none" autoCorrect="off"
                aria-describedby="required-help" placeholder={'dist/index.html\ndist/app.js\ndist/style.css'}
                value={state.requiredText} disabled={state.phase === 'scanning'}
                onChange={event => workflow.setRequiredText(event.currentTarget.value)} />
            </section>
          </div>

          <div className="actions">
            <button type="submit" className="primary" disabled={!canScan(state)}>
              {state.phase === 'scanning' ? 'Scanning…' : 'Scan package'}
            </button>
            {state.phase === 'scanning' && <button type="button" onClick={() => workflow.cancel()}>Cancel scan</button>}
          </div>
        </form>

        <div className="intro-panels">
          <ChecksOverview />
          <section className="example-intro" aria-labelledby="example-heading">
            <div><h2 id="example-heading">Synthetic sample</h2>
              <p className="help">HTML references <code>style.css</code> and <code>app.js</code>, but only the stylesheet is packed.
                No third-party package code. Starts with no required files.</p></div>
            <button type="button" disabled={state.phase === 'scanning'} onClick={() => { void workflow.tryExample(); }}>Run sample scan</button>
          </section>
        </div>

        <section className={`scan-status ${state.phase}`} role="status" aria-live="polite" aria-atomic="true">
          <h2>{statusTitles[state.phase]}</h2>
          {state.message && <p>{state.message}</p>}
          {state.phase === 'idle' && <p>Select a package to begin.</p>}
          {state.phase === 'ready' && <p>Your package is selected. Start the scan when ready.</p>}
          {state.phase === 'scanning' && <p>Checking your packed files in this browser. You can cancel at any time.</p>}
          {state.phase === 'completed' && state.audit && <>
            <p>Outcome: <code>{state.audit.outcome}</code></p>
          </>}
        </section>
        {state.phase === 'completed' && <button type="button" className="scan-another" onClick={() => {
          workflow.removeFile(); picker.current?.closest('section')?.querySelector<HTMLButtonElement>('.drop-zone')?.focus();
        }}>Scan another package</button>}
        {state.phase === 'completed' && state.inputKind === 'example' && <p className="demo-note">Example results — synthetic package.</p>}
        {state.phase === 'completed' && state.audit && <AuditReport audit={state.audit} />}
        {state.phase === 'completed' && state.experiment && <ExperimentPrompts prompts={state.experiment}
          answerLaterRelease={yes => workflow.answerLaterRelease(yes)} expressInterest={() => workflow.expressPaidInterest()} />}
        <p className="scope-note">Checks literal HTML asset references and optional required files.
          This does not guarantee that the package works at runtime.</p>
        <LaunchNotes />
      </main>
    </>
  );
}
