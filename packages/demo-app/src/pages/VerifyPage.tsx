import { useState, useEffect } from 'react';
import { useDemo } from '../lib/demo-state';
import type { VerificationResult } from '@breakchain/core';

type VerifyStep = 'idle' | 'selecting' | 'proving' | 'verifying' | 'done';

export function VerifyPage() {
  const { initialize, initialized, credentials, revokedIds, verifyCredential } = useDemo();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proofMode, setProofMode] = useState('zkp');
  const [step, setStep] = useState<VerifyStep>('idle');
  const [result, setResult] = useState<VerificationResult | null>(null);

  useEffect(() => { initialize(); }, [initialize]);

  const handleVerify = async () => {
    if (!selectedId) return;
    setResult(null);

    setStep('selecting');
    await delay(400);
    setStep('proving');
    await delay(800);
    setStep('verifying');
    await delay(500);

    const res = await verifyCredential(selectedId, proofMode);
    setResult(res);
    setStep('done');
  };

  const steps: { key: VerifyStep; label: string }[] = [
    { key: 'selecting', label: 'Finding matching credential in wallet' },
    { key: 'proving', label: proofMode === 'zkp' ? 'Generating ZK proof (Groth16)' : 'Building presentation' },
    { key: 'verifying', label: 'Verifying proof + issuer signature + revocation' },
    { key: 'done', label: result?.valid ? 'Verification passed ✓' : 'Verification complete' },
  ];

  const stepIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="page-container">
      <h1 className="page-title" id="verify-title">Verify with ZKP</h1>
      <p className="page-subtitle">
        Select a credential and proof mode. The verifier checks the ZK proof, issuer signature,
        and revocation status — without seeing your private data.
      </p>

      {credentials.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            No credentials in wallet. <a href="/issue">Issue one first</a>.
          </p>
        </div>
      ) : (
        <div className="grid-2">
          {/* Controls */}
          <div className="card">
            <div className="card-header">
              <div className="card-icon emerald">🔐</div>
              <h3 className="card-title">Verification Request</h3>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="select-credential">Credential</label>
              <select
                id="select-credential"
                className="form-select"
                value={selectedId || ''}
                onChange={e => { setSelectedId(e.target.value); setResult(null); setStep('idle'); }}
              >
                <option value="">Select a credential…</option>
                {credentials.map(c => {
                  const subj = Array.isArray(c.credentialSubject) ? c.credentialSubject[0] : c.credentialSubject;
                  const label = `${subj.name || 'Unknown'} — ${c.type.filter(t => t !== 'VerifiableCredential').join(', ')}`;
                  return <option key={c.id} value={c.id}>{label}{revokedIds.has(c.id) ? ' (REVOKED)' : ''}</option>;
                })}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Proof Mode</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[
                  { key: 'zkp', label: '🛡️ ZKP', desc: 'Zero-Knowledge' },
                  { key: 'sd-jwt', label: '📋 SD-JWT', desc: 'Selective Disclosure' },
                  { key: 'plain', label: '📝 Plain', desc: 'Full VP' },
                ].map(m => (
                  <button
                    key={m.key}
                    className={`btn ${proofMode === m.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => setProofMode(m.key)}
                    style={{ flex: 1, flexDirection: 'column', padding: '0.6rem 0.5rem' }}
                  >
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn btn-primary"
              id="btn-verify"
              onClick={handleVerify}
              disabled={!selectedId || (step !== 'idle' && step !== 'done')}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {step !== 'idle' && step !== 'done' ? <span className="spinner" /> : '🔍'} Verify Credential
            </button>
          </div>

          {/* Results */}
          <div>
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <div className="card-icon cyan">⚡</div>
                <h3 className="card-title">Verification Flow</h3>
              </div>
              <div className="steps">
                {steps.map((s, i) => (
                  <div key={s.key} className={`step ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'completed' : ''}`}>
                    <span className="step-number">{i < stepIndex ? '✓' : i + 1}</span>
                    <span className="step-label">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {result && (
              <div className={`verification-result ${result.valid ? 'success' : 'failure'}`}>
                <div className="verification-icon">{result.valid ? '✅' : '❌'}</div>
                <div className="verification-title" style={{ color: result.valid ? 'var(--accent-emerald-light)' : 'var(--accent-rose)' }}>
                  {result.valid ? 'Verification Passed' : 'Verification Failed'}
                </div>
                <div className="verification-detail">
                  <div className="verification-detail-row">
                    <span>Issuer Signature</span>
                    <span>{result.issuerVerified ? '✅' : '❌'}</span>
                  </div>
                  <div className="verification-detail-row">
                    <span>Holder Binding</span>
                    <span>{result.holderVerified ? '✅' : '❌'}</span>
                  </div>
                  <div className="verification-detail-row">
                    <span>Proof Valid</span>
                    <span>{result.proofVerified ? '✅' : '❌'}</span>
                  </div>
                  <div className="verification-detail-row">
                    <span>Revocation Check</span>
                    <span>{result.revocationChecked ? '✅' : '⏳'}</span>
                  </div>
                  {result.errors.length > 0 && (
                    <div style={{ marginTop: '0.75rem', textAlign: 'left' }}>
                      {result.errors.map((err, i) => (
                        <p key={i} style={{ color: 'var(--accent-rose)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>⚠ {err}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
