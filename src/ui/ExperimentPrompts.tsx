import type { ExperimentPrompts as Prompts } from '../measurement/experiment';

export function ExperimentPrompts({ prompts, answerLaterRelease, expressInterest }: {
  prompts: Prompts; answerLaterRelease: (yes: boolean) => void; expressInterest: () => void;
}) {
  return <>
    {prompts.laterRelease && <section className="experiment-card" aria-labelledby="later-heading">
      <h2 id="later-heading">Optional experiment question</h2>
      <p>Is this a later release candidate rather than a retry of the same fix?</p>
      {prompts.laterAnswered ? <p>Thanks for your answer.</p> : <div className="actions">
        <button type="button" onClick={() => answerLaterRelease(true)}>Yes</button>
        <button type="button" onClick={() => answerLaterRelease(false)}>No / not sure</button>
      </div>}
    </section>}
    {prompts.paidInterest && <section className="experiment-card" aria-labelledby="interest-heading">
      <h2 id="interest-heading">Local Release Pack — $19 one-time</h2>
      <p>A possible future local release workflow. <strong>Not available yet.</strong> This is interest only, not a purchase.</p>
      <p className="help">Possible future features: reusable release policies, batch package checks,
        baseline comparisons, and a CI-friendly report.</p>
      <button type="button" disabled={prompts.interestSent} onClick={expressInterest}>
        {prompts.interestSent ? 'Interest noted — thank you' : "I'm interested"}
      </button>
    </section>}
  </>;
}
