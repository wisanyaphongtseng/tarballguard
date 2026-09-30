import { useState } from 'react';
import { PackageScanClient } from './worker/client';

export default function App() {
  const [smoke, setSmoke] = useState('');
  const [running, setRunning] = useState(false);
  return (
    <main>
      <h1>npm Packed Web-Asset Integrity Preflight</h1>
      <p>Project setup is ready. Package scanning is not available yet.</p>
      {import.meta.env.DEV && <section>
        <button disabled={running} onClick={async () => {
          setRunning(true);
          try {
            const { runWorkerSmoke } = await import('./worker/dev-smoke');
            await runWorkerSmoke(new PackageScanClient(), setSmoke);
          } finally { setRunning(false); }
        }}>Run developer worker smoke test</button>
        <pre>{smoke}</pre>
      </section>}
    </main>
  );
}
