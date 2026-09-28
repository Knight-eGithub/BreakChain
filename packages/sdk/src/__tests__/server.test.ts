/**
 * Tests for @breakchain/sdk/server — server-side verification
 */
import { describe, it, expect } from 'vitest';
import { createServerVerifier, verifyPresentation } from '../server';
import { MockProverBackend } from '@breakchain/prover';
import type { VerifiablePresentation } from '@breakchain/core';

// Minimal valid VP for testing
const mockVP: VerifiablePresentation = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiablePresentation'],
  verifiableCredential: [],
  holder: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
};

describe('Server-side Verification', () => {
  it('createServerVerifier returns a VerificationEngine', () => {
    const verifier = createServerVerifier();
    expect(verifier).toBeDefined();
    expect(verifier.verify).toBeTypeOf('function');
  });

  it('createServerVerifier accepts config with prover backend', () => {
    const mockProver = new MockProverBackend();
    const verifier = createServerVerifier({
      proverBackend: mockProver,
      issuerUrl: 'https://issuer.example.com',
      revocationCheck: true,
    });
    expect(verifier).toBeDefined();
  });

  it('verifyPresentation convenience function works', async () => {
    // With an empty VP, verification will report issues but should not throw
    const result = await verifyPresentation(mockVP);
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('verifyPresentation with ZKP type requires prover backend', async () => {
    const zkpVP: VerifiablePresentation = {
      ...mockVP,
      type: ['VerifiablePresentation', 'ZKProofPresentation'],
      proof: {
        type: 'Groth16Proof2024',
        created: new Date().toISOString(),
        verificationMethod: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#key-1',
        proofPurpose: 'assertionMethod',
        proofValue: JSON.stringify({ mock: true }),
        circuitId: 'age_over',
        publicSignals: ['12345'],
      } as any,
    };

    // Without prover backend, should report error about missing backend
    const result = await verifyPresentation(zkpVP);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('prover backend'))).toBe(true);
  });

  it('verifyPresentation with ZKP uses provided prover backend', async () => {
    const mockProver = new MockProverBackend();
    const proofData = await mockProver.generateProof(
      { circuitId: 'age_over' },
      { age: 25, salt: '12345', ageHash: '67890' }
    );

    const zkpVP: VerifiablePresentation = {
      ...mockVP,
      type: ['VerifiablePresentation', 'ZKProofPresentation'],
      proof: {
        type: 'Groth16Proof2024',
        created: new Date().toISOString(),
        verificationMethod: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#key-1',
        proofPurpose: 'assertionMethod',
        proofValue: JSON.stringify(proofData.proof),
        circuitId: 'age_over',
        publicSignals: proofData.publicSignals,
      } as any,
    };

    const result = await verifyPresentation(zkpVP, {
      proverBackend: mockProver,
    });
    expect(result.proofVerified).toBe(true);
  });
});
