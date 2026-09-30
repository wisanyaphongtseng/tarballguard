import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PackageScanClient } from './worker/client';
import { canScan, ScanWorkflow } from './ui/scan-workflow';
import { readableFileSize, visibleFileName } from './ui/file-display';

const statusTitles = {
  idle: 'Choose a package', ready: 'Ready to scan', scanning: 'Scanning locally…',
  completed: 'Scan complete', error: 'Scan could not complete', cancelled: 'Scan cancelled',
};

export default function App() {
  const [workflow] = useState(() => new ScanWorkflow(new PackageScanClient()));
  const state = useSyncExternalStore(workflow.subscribe, workflow.getSnapshot, workflow.getSnapshot);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => () => workflow.cancel(), [workflow]);

  return (
    <main>
      <header>
        <p className="product-name">npm Packed Web-Asset Preflight</p>
        <h1>Check the npm package you are actually publishing.</h1>
        <p className="intro">Find packed HTML references that point to files missing from the final .tgz.</p>
        <p className="privacy"><strong>Your package stays in this browser.</strong><br />
          Runs locally in your browser. Your package is not uploaded.</p>
      </header>

      <form onSubmit={event => { event.preventDefault(); void workflow.start(); }}>
        <section aria-labelledby="package-label">
          <h2 id="package-label">Package archive</h2>
          <input ref={picker} type="file" accept=".tgz" hidden aria-label="Choose npm .tgz package"
            onChange={event => {
              workflow.selectFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }} />
          <button type="button" className={`drop-zone${dragging ? ' dragging' : ''}`}
            aria-describedby="package-help" onClick={() => picker.current?.click()}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={event => {
              event.preventDefault(); setDragging(false);
              workflow.selectFiles(Array.from(event.dataTransfer.files));
            }}>
            <span className="drop-title">{state.file ? 'Drop another .tgz or choose a replacement' : 'Drop your .tgz here or choose a file'}</span>
            <span>One npm package at a time</span>
          </button>
          <p id="package-help" className="help">Select the packed .tgz artifact. The archive is validated when you scan.</p>
          {state.file && <div className="selected-file">
            <div><strong className="filename">{visibleFileName(state.file.name)}</strong>
              <span className="file-size">{readableFileSize(state.file.size)}</span></div>
            <button type="button" onClick={() => workflow.removeFile()}>Remove file</button>
          </div>}
        </section>

        <section>
          <label htmlFor="required-files">Required files <span className="optional">(optional)</span></label>
          <p id="required-help" className="help">Optional: list files that must exist in the packed package.
            One package-relative path per line. Blank lines are ignored; spaces in paths are kept exactly.</p>
          <textarea id="required-files" rows={4} spellCheck={false} autoCapitalize="none" autoCorrect="off"
            aria-describedby="required-help" placeholder={'dist/index.html\ndist/app.js\ndist/style.css'}
            value={state.requiredText} disabled={state.phase === 'scanning'}
            onChange={event => workflow.setRequiredText(event.currentTarget.value)} />
        </section>

        <div className="actions">
          <button type="submit" className="primary" disabled={!canScan(state)}>
            {state.phase === 'scanning' ? 'Scanning…' : 'Scan package'}
          </button>
          {state.phase === 'scanning' && <button type="button" onClick={() => workflow.cancel()}>Cancel scan</button>}
        </div>
      </form>

      <section className={`scan-status ${state.phase}`} role="status" aria-live="polite" aria-atomic="true">
        <h2>{statusTitles[state.phase]}</h2>
        {state.message && <p>{state.message}</p>}
        {state.phase === 'idle' && <p>Select a package to begin.</p>}
        {state.phase === 'ready' && <p>Your package is selected. Start the scan when ready.</p>}
        {state.phase === 'scanning' && <p>Checking your packed files in this browser. You can cancel at any time.</p>}
        {state.phase === 'completed' && state.audit && <>
          <p>Outcome: <code>{state.audit.outcome}</code></p>
          <p>Detailed report UI coming next.</p>
        </>}
      </section>
      <p className="scope-note">Checks literal HTML asset references and optional required files.
        This does not guarantee that the package works at runtime.</p>
    </main>
  );
}
