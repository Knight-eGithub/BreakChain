import { useState, useEffect } from 'react';
import { useDemo } from '../lib/demo-state';
import { CredentialCard } from '../components/CredentialCard';

const DEMO_PRESETS = [
  { label: 'Adult (Age 25)', claims: { name: 'Alice Doe', age: 25, nationality: 'US', email: 'alice@example.com' } },
  { label: 'Minor (Age 16)', claims: { name: 'Bob Young', age: 16, nationality: 'UK', email: 'bob@example.com' } },
  { label: 'EU Citizen', claims: { name: 'Clara Müller', age: 30, nationality: 'DE', email: 'clara@example.com' } },
];

type FlowStep = 'idle' | 'generating' | 'signing' | 'storing' | 'done';

export function IssuePage() {
  const { initialize, initialized, issueCredential, credentials } = useDemo();

  const [name, setName] = useState('Alice Doe');
  const [age, setAge] = useState(25);
  const [nationality, setNationality] = useState('US');
  const [email, setEmail] = useState('alice@example.com');
  const [step, setStep] = useState<FlowStep>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { initialize(); }, [initialize]);

  const applyPreset = (preset: typeof DEMO_PRESETS[0]) => {
    setName(preset.claims.name);
    setAge(preset.claims.age);
    setNationality(preset.claims.nationality);
    setEmail(preset.claims.email);
  };

  const handleIssue = async () => {
    setError(null);
    try {
      setStep('generating');
      await delay(600);
      setStep('signing');
      await delay(500);
      await issueCredential({ name, age, nationality, email });
      setStep('storing');
      await delay(400);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to issue credential');
      setStep('idle');
    }
  };

  const steps: { key: FlowStep; label: string }[] = [
    { key: 'generating', label: 'Creating credential offer & building VC' },
    { key: 'signing', label: 'Signing with issuer Ed25519 key (JWS)' },
    { key: 'storing', label: 'Storing in wallet credential store' },
    { key: 'done', label: 'Credential issued successfully ✓' },
  ];

  const stepIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="page-container">
      <h1 className="page-title" id="issue-title">Issue a Credential</h1>
      <p className="page-subtitle">
        Fill in identity claims and the mock issuer will create a W3C Verifiable Credential
        signed with Ed25519, stored in your wallet.
      </p>

      <div className="grid-2">
        {/* Form */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon purple">🎫</div>
            <h3 className="card-title">Identity Claims</h3>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {DEMO_PRESETS.map(p => (
              <button key={p.label} className="btn btn-secondary btn-sm" onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="input-name">Full Name</label>
            <input id="input-name" className="form-input" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="input-age">Age</label>
            <input id="input-age" className="form-input" type="number" value={age} onChange={e => setAge(+e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="input-nationality">Nationality</label>
            <input id="input-nationality" className="form-input" value={nationality} onChange={e => setNationality(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="input-email">Email</label>
            <input id="input-email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <button
            className="btn btn-primary"
            id="btn-issue"
            onClick={handleIssue}
            disabled={!initialized || (step !== 'idle' && step !== 'done')}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {step !== 'idle' && step !== 'done' ? <span className="spinner" /> : '🏛️'} Issue Credential
          </button>

          {error && <p style={{ color: 'var(--accent-rose)', marginTop: '0.75rem', fontSize: '0.85rem' }}>{error}</p>}
        </div>

        {/* Steps */}
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <div className="card-icon cyan">⚡</div>
              <h3 className="card-title">Issuance Flow</h3>
            </div>
            <div className="steps">
              {steps.map((s, i) => (
                <div
                  key={s.key}
                  className={`step ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'completed' : ''}`}
                >
                  <span className="step-number">{i < stepIndex ? '✓' : i + 1}</span>
                  <span className="step-label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Latest credential */}
          {credentials.length > 0 && (
            <CredentialCard credential={credentials[credentials.length - 1]} />
          )}
        </div>
      </div>
    </div>
  );
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
