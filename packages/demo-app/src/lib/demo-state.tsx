import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { VerifiableCredential, VerificationResult } from '@breakchain/core';
import { MockIssuer } from './mock-issuer';
import { MockWallet } from './mock-wallet';

export interface DemoState {
  wallet: MockWallet | null;
  issuer: MockIssuer | null;
  walletDid: string | null;
  issuerDid: string | null;
  credentials: VerifiableCredential[];
  revokedIds: Set<string>;
  lastVerification: VerificationResult | null;
  initialized: boolean;
}

interface DemoContextValue extends DemoState {
  initialize: () => Promise<void>;
  issueCredential: (claims: Record<string, unknown>) => Promise<VerifiableCredential>;
  verifyCredential: (credentialId: string, proofMode: string) => Promise<VerificationResult>;
  revokeCredential: (credentialId: string) => void;
  refreshCredentials: () => Promise<void>;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>({
    wallet: null,
    issuer: null,
    walletDid: null,
    issuerDid: null,
    credentials: [],
    revokedIds: new Set(),
    lastVerification: null,
    initialized: false,
  });

  const initialize = useCallback(async () => {
    if (state.initialized) return;
    const issuer = new MockIssuer();
    await issuer.initialize();
    const wallet = new MockWallet();
    await wallet.initialize();
    setState(s => ({
      ...s,
      wallet,
      issuer,
      walletDid: wallet.getDid(),
      issuerDid: issuer.getDid(),
      initialized: true,
    }));
  }, [state.initialized]);

  const issueCredential = useCallback(async (claims: Record<string, unknown>) => {
    if (!state.issuer || !state.wallet) throw new Error('Not initialized');
    const vc = state.issuer.issueCredential(state.wallet.getDid(), claims);
    await state.wallet.addCredential(vc);
    const creds = await state.wallet.getCredentials();
    setState(s => ({ ...s, credentials: creds }));
    return vc;
  }, [state.issuer, state.wallet]);

  const verifyCredential = useCallback(async (credentialId: string, _proofMode: string) => {
    if (!state.wallet || !state.issuer) throw new Error('Not initialized');
    const creds = await state.wallet.getCredentials();
    const vc = creds.find(c => c.id === credentialId);
    if (!vc) {
      return { valid: false, issuerVerified: false, holderVerified: false, proofVerified: false, revocationChecked: true, errors: ['Credential not found'] };
    }
    const isRevoked = state.revokedIds.has(credentialId);
    if (isRevoked) {
      return { valid: false, issuerVerified: true, holderVerified: true, proofVerified: true, revocationChecked: true, errors: ['Credential has been revoked'] };
    }
    const result = await state.issuer.verifyCredentialSignature(vc);
    return { ...result, revocationChecked: true };
  }, [state.wallet, state.issuer, state.revokedIds]);

  const revokeCredential = useCallback((credentialId: string) => {
    setState(s => {
      const newRevoked = new Set(s.revokedIds);
      newRevoked.add(credentialId);
      return { ...s, revokedIds: newRevoked };
    });
  }, []);

  const refreshCredentials = useCallback(async () => {
    if (!state.wallet) return;
    const creds = await state.wallet.getCredentials();
    setState(s => ({ ...s, credentials: creds }));
  }, [state.wallet]);

  return (
    <DemoContext.Provider value={{ ...state, initialize, issueCredential, verifyCredential, revokeCredential, refreshCredentials }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used within <DemoProvider>');
  return ctx;
}
