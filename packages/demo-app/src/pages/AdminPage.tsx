import { useEffect } from 'react';
import { useDemo } from '../lib/demo-state';
import { CredentialCard } from '../components/CredentialCard';

export function AdminPage() {
  const { initialize, initialized, credentials, revokedIds, revokeCredential, issuerDid } = useDemo();

  useEffect(() => { initialize(); }, [initialize]);

  return (
    <div className="page-container">
      <h1 className="page-title" id="admin-title">Admin Panel</h1>
      <p className="page-subtitle">
        Issuer administration — view all issued credentials and manage revocation status.
        Revoking a credential will cause future verification to fail.
      </p>

      {/* Issuer Info */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div className="card-icon purple">🏛️</div>
          <h3 className="card-title">Issuer Identity</h3>
        </div>
        <div className="credential-field">
          <span className="credential-field-label">Issuer DID</span>
          <span className="credential-field-value" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
            {issuerDid || 'Not initialized'}
          </span>
        </div>
        <div className="credential-field">
          <span className="credential-field-label">Total Issued</span>
          <span className="credential-field-value">{credentials.length}</span>
        </div>
        <div className="credential-field">
          <span className="credential-field-label">Revoked</span>
          <span className="credential-field-value" style={{ color: revokedIds.size > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald-light)' }}>
            {revokedIds.size}
          </span>
        </div>
      </div>

      {/* Credentials */}
      {credentials.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📭</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            No credentials issued yet. <a href="/issue">Issue one first</a>.
          </p>
        </div>
      ) : (
        <div className="grid-2">
          {credentials.map(vc => {
            const isRevoked = revokedIds.has(vc.id);
            return (
              <CredentialCard
                key={vc.id}
                credential={vc}
                isRevoked={isRevoked}
                actions={
                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {vc.id.slice(0, 20)}…
                    </span>
                    {!isRevoked ? (
                      <button
                        className="btn btn-danger btn-sm"
                        id={`btn-revoke-${vc.id}`}
                        onClick={() => revokeCredential(vc.id)}
                      >
                        🚫 Revoke
                      </button>
                    ) : (
                      <span className="status-badge disconnected">
                        <span className="status-dot" style={{ animation: 'none' }} />
                        Revoked
                      </span>
                    )}
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
