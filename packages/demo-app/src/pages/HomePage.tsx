import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from '../lib/demo-state';

export function HomePage() {
  const { initialize, initialized } = useDemo();
  const navigate = useNavigate();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="page-container">
      {/* Hero */}
      <section className="hero" id="hero-section">
        <h1 className="hero-title">Privacy-First Identity</h1>
        <p className="hero-subtitle">
          Prove who you are without revealing what you are. BreakChain uses Zero-Knowledge Proofs
          and W3C Verifiable Credentials to enable private, verifiable identity.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" id="btn-get-started" onClick={() => navigate('/issue')}>
            🎫 Get a Credential
          </button>
          <button className="btn btn-secondary" id="btn-verify" onClick={() => navigate('/verify')}>
            🔐 Verify with ZKP
          </button>
        </div>
      </section>

      {/* Flow Diagram */}
      <section id="flow-section">
        <div className="flow-diagram">
          <div className="flow-node">
            <div className="flow-node-icon">🏛️</div>
            <div className="flow-node-label">Issuer</div>
          </div>
          <span className="flow-arrow">→</span>
          <div className="flow-node">
            <div className="flow-node-icon">👛</div>
            <div className="flow-node-label">Wallet</div>
          </div>
          <span className="flow-arrow">→</span>
          <div className="flow-node">
            <div className="flow-node-icon">🔒</div>
            <div className="flow-node-label">ZK Proof</div>
          </div>
          <span className="flow-arrow">→</span>
          <div className="flow-node">
            <div className="flow-node-icon">✅</div>
            <div className="flow-node-label">Verifier</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features-grid" id="features-section">
        <div className="card">
          <div className="card-header">
            <div className="card-icon purple">🛡️</div>
            <h3 className="card-title">Zero-Knowledge Proofs</h3>
          </div>
          <p className="card-description">
            Prove you're over 18 without revealing your age. Prove your nationality
            without exposing your passport. ZKPs let you verify claims while keeping data private.
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-icon cyan">📋</div>
            <h3 className="card-title">W3C Verifiable Credentials</h3>
          </div>
          <p className="card-description">
            Standards-compliant credentials using the W3C VC Data Model v2. Interoperable
            with any compliant issuer, wallet, or verifier.
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-icon emerald">🔑</div>
            <h3 className="card-title">Selective Disclosure</h3>
          </div>
          <p className="card-description">
            SD-JWT support lets holders choose exactly which claims to reveal.
            Share your name without your address. Your data, your choice.
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-icon rose">🆔</div>
            <h3 className="card-title">Decentralized Identity</h3>
          </div>
          <p className="card-description">
            Built on DID:key and DID:web methods. No central authority controls your identity.
            Ed25519 cryptography ensures tamper-proof credentials.
          </p>
        </div>
      </section>

      {/* Status */}
      {initialized && (
        <div className="card" style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ color: 'var(--accent-emerald-light)', fontWeight: 600 }}>
            ✅ SDK Initialized — Issuer and Wallet are ready
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Navigate to <strong>Issue</strong> to get your first credential
          </p>
        </div>
      )}
    </div>
  );
}
