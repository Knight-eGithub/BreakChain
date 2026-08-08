import type { ReactNode } from 'react';
import type { VerifiableCredential } from '@breakchain/core';

interface CredentialCardProps {
  credential: VerifiableCredential;
  isRevoked?: boolean;
  actions?: ReactNode;
}

export function CredentialCard({ credential, isRevoked, actions }: CredentialCardProps) {
  const subject = Array.isArray(credential.credentialSubject)
    ? credential.credentialSubject[0]
    : credential.credentialSubject;

  const issuerDid = typeof credential.issuer === 'string'
    ? credential.issuer
    : credential.issuer.id;

  const credTypes = credential.type.filter(t => t !== 'VerifiableCredential');
  const displayType = credTypes.length > 0 ? credTypes.join(', ') : 'Credential';

  // Extract display claims (exclude 'id')
  const claims = Object.entries(subject).filter(([key]) => key !== 'id');

  const truncate = (s: string, n: number) =>
    s.length > n ? `${s.slice(0, n)}...` : s;

  return (
    <div className="credential-card" id={`credential-${credential.id}`}>
      <div className="credential-card-header">
        <span className="credential-card-type">{displayType}</span>
        {isRevoked && (
          <span className="status-badge disconnected" style={{ fontSize: '0.7rem' }}>
            <span className="status-dot" style={{ animation: 'none' }} />
            REVOKED
          </span>
        )}
        {!isRevoked && (
          <span className="status-badge connected" style={{ fontSize: '0.7rem' }}>
            <span className="status-dot" />
            ACTIVE
          </span>
        )}
      </div>

      <div className="credential-card-body">
        {claims.map(([key, value]) => (
          <div className="credential-field" key={key}>
            <span className="credential-field-label">{key}</span>
            <span className="credential-field-value">{String(value)}</span>
          </div>
        ))}
        <div className="credential-field">
          <span className="credential-field-label">Issuer</span>
          <span className="credential-field-value" title={issuerDid}>
            {truncate(issuerDid, 24)}
          </span>
        </div>
        <div className="credential-field">
          <span className="credential-field-label">Issued</span>
          <span className="credential-field-value">
            {new Date(credential.issuanceDate).toLocaleDateString()}
          </span>
        </div>
      </div>

      {actions && (
        <div className="credential-card-footer">
          {actions}
        </div>
      )}
    </div>
  );
}
