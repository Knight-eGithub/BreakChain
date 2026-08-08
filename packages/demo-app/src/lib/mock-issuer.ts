import type { VerifiableCredential, VerificationResult } from '@breakchain/core';
import { generateEd25519KeyPair } from '@breakchain/crypto';
import { generateDidKey } from '@breakchain/did';
import { createCredential, signCredential, verifyCredentialSignature } from '@breakchain/credentials';

/**
 * MockIssuer — in-browser mock issuer using the real SDK packages.
 *
 * Generates an issuer DID + keypair, issues signed VCs, and tracks
 * issued credentials for revocation demo.
 */
export class MockIssuer {
  private keyPair: { publicKey: Uint8Array; privateKey: Uint8Array } | null = null;
  private did: string | null = null;
  private issuedCredentials: Map<string, VerifiableCredential> = new Map();

  async initialize(): Promise<void> {
    this.keyPair = generateEd25519KeyPair();
    this.did = generateDidKey(this.keyPair.publicKey);
  }

  getDid(): string {
    if (!this.did) throw new Error('Issuer not initialized');
    return this.did;
  }

  getPublicKey(): Uint8Array {
    if (!this.keyPair) throw new Error('Issuer not initialized');
    return this.keyPair.publicKey;
  }

  /**
   * Issues a signed Verifiable Credential.
   */
  issueCredential(
    subjectDid: string,
    claims: Record<string, unknown>,
    types: string[] = ['IDCard'],
  ): VerifiableCredential {
    if (!this.keyPair || !this.did) throw new Error('Issuer not initialized');

    const vc = createCredential({
      issuer: this.did,
      subject: { id: subjectDid, ...claims },
      types,
    });

    const verificationMethod = `${this.did}#${this.did.slice('did:key:'.length)}`;
    const signed = signCredential(vc, this.keyPair.privateKey, verificationMethod);

    this.issuedCredentials.set(signed.id, signed);
    return signed;
  }

  /**
   * Verifies a credential's signature using the issuer's public key.
   */
  async verifyCredentialSignature(vc: VerifiableCredential): Promise<VerificationResult> {
    if (!this.keyPair) throw new Error('Issuer not initialized');
    const valid = verifyCredentialSignature(vc, this.keyPair.publicKey);
    return {
      valid,
      issuerVerified: valid,
      holderVerified: true,
      proofVerified: valid,
      revocationChecked: false,
      errors: valid ? [] : ['Credential signature verification failed'],
    };
  }

  /**
   * Returns all issued credentials.
   */
  getIssuedCredentials(): VerifiableCredential[] {
    return Array.from(this.issuedCredentials.values());
  }
}
