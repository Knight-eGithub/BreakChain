import type { VerifiableCredential, CredentialSubject, CredentialProof, CredentialStatus, VerificationResult } from '@breakchain/core';
import { createJWS, verifyJWS } from '@breakchain/crypto';
import { W3C_CREDENTIALS_CONTEXT } from '@breakchain/core';
import type { DIDResolver } from '@breakchain/did';

export interface CreateCredentialOptions {
  issuer: string;
  subject: CredentialSubject | CredentialSubject[];
  types?: string[];
  id?: string;
  issuanceDate?: string;
  expirationDate?: string;
  credentialStatus?: CredentialStatus;
}

/**
 * Generates a UUID for credential ID if not provided.
 */
function generateId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `urn:uuid:${globalThis.crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `urn:uuid:${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/**
 * Creates an unsigned Verifiable Credential.
 * @param options Create credential options
 * @returns An unsigned Verifiable Credential
 */
export function createCredential(options: CreateCredentialOptions): VerifiableCredential {
  return {
    '@context': [W3C_CREDENTIALS_CONTEXT],
    id: options.id || generateId(),
    type: ['VerifiableCredential', ...(options.types || [])],
    issuer: options.issuer,
    issuanceDate: options.issuanceDate || new Date().toISOString(),
    expirationDate: options.expirationDate,
    credentialSubject: options.subject,
    credentialStatus: options.credentialStatus
  };
}

/**
 * Signs a credential and adds a proof field with the JWS.
 * @param credential The unsigned credential
 * @param privateKey The Ed25519 private key
 * @param verificationMethod The DID URL of the key used to sign
 * @returns A new Verifiable Credential with the proof field
 */
export function signCredential(credential: VerifiableCredential, privateKey: Uint8Array, verificationMethod: string): VerifiableCredential {
  const { proof, ...credentialWithoutProof } = credential;
  const jws = createJWS(credentialWithoutProof as Record<string, unknown>, privateKey);
  
  const newProof: CredentialProof = {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod,
    proofPurpose: 'assertionMethod',
    jws
  };

  return {
    ...credentialWithoutProof,
    proof: newProof
  } as VerifiableCredential;
}

/**
 * Verifies a credential's signature using a raw public key.
 * @param credential The signed Verifiable Credential
 * @param publicKey The public key bytes associated with the verification method
 * @returns true if signature is valid, false otherwise
 */
export function verifyCredentialSignature(credential: VerifiableCredential, publicKey: Uint8Array): boolean {
  if (!credential.proof) return false;
  
  const proof = Array.isArray(credential.proof) ? credential.proof[0] : credential.proof;
  if (!proof.jws) return false;
  
  const result = verifyJWS(proof.jws, publicKey);
  return result.valid;
}

/**
 * Extracts the issuer DID from a Verifiable Credential.
 */
function extractIssuerDid(credential: VerifiableCredential): string {
  if (typeof credential.issuer === 'string') return credential.issuer;
  return credential.issuer.id;
}

/**
 * Full credential verification using a DID resolver.
 *
 * Resolves the issuer's DID from the credential, extracts the public key
 * from the DID Document, and verifies the proof signature. Returns a
 * structured {@link VerificationResult} with granular status.
 *
 * @param credential The signed Verifiable Credential to verify
 * @param resolver A DIDResolver instance (e.g. from `createResolver()`)
 * @returns A structured verification result
 */
export async function verifyCredential(
  credential: VerifiableCredential,
  resolver: DIDResolver,
): Promise<VerificationResult> {
  const result: VerificationResult = {
    valid: false,
    issuerVerified: false,
    holderVerified: false, // Not applicable for VC-level verification
    proofVerified: false,
    revocationChecked: false,
    errors: [],
  };

  // 1. Check proof exists
  if (!credential.proof) {
    result.errors.push('Credential has no proof');
    return result;
  }

  const proof = Array.isArray(credential.proof) ? credential.proof[0] : credential.proof;
  if (!proof.jws) {
    result.errors.push('Credential proof has no JWS');
    return result;
  }

  // 2. Resolve the issuer DID to extract the public key
  const issuerDid = extractIssuerDid(credential);
  let publicKey: Uint8Array | null = null;

  try {
    const didDoc = await resolver.resolve(issuerDid);
    publicKey = resolver.extractPublicKey(didDoc);
  } catch (err) {
    result.errors.push(`Failed to resolve issuer DID "${issuerDid}": ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  if (!publicKey) {
    result.errors.push(`No public key found in issuer DID Document for "${issuerDid}"`);
    return result;
  }

  result.issuerVerified = true;

  // 3. Verify the JWS signature
  const jwsResult = verifyJWS(proof.jws, publicKey);
  result.proofVerified = jwsResult.valid;

  if (!jwsResult.valid) {
    result.errors.push('Credential JWS signature verification failed');
    return result;
  }

  // 4. Check expiration (basic structural check)
  if (credential.expirationDate) {
    const expiry = new Date(credential.expirationDate);
    if (expiry.getTime() < Date.now()) {
      result.errors.push(`Credential expired on ${credential.expirationDate}`);
      return result;
    }
  }

  result.valid = true;
  return result;
}

