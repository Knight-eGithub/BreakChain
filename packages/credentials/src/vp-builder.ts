import type { VerifiablePresentation, VerifiableCredential, CredentialProof, VerificationResult } from '@breakchain/core';
import { createJWS, verifyJWS } from '@breakchain/crypto';
import { W3C_CREDENTIALS_CONTEXT } from '@breakchain/core';
import type { DIDResolver } from '@breakchain/did';
import { verifyCredential } from './vc-builder';

export interface CreatePresentationOptions {
  credentials: VerifiableCredential[];
  holder?: string;
  id?: string;
}

/**
 * Creates an unsigned Verifiable Presentation.
 * @param options Options for creating presentation
 * @returns Unsigned VP
 */
export function createPresentation(options: CreatePresentationOptions): VerifiablePresentation {
  const vp: VerifiablePresentation = {
    '@context': [W3C_CREDENTIALS_CONTEXT],
    type: ['VerifiablePresentation'],
    verifiableCredential: options.credentials
  };
  
  if (options.holder) {
    vp.holder = options.holder;
  }
  
  return vp;
}

/**
 * Signs a presentation.
 * @param presentation Unsigned presentation
 * @param privateKey Signer's private key
 * @param verificationMethod The verification method identifier
 * @param challenge Optional challenge for authentication
 * @returns Signed VP
 */
export function signPresentation(
  presentation: VerifiablePresentation,
  privateKey: Uint8Array,
  verificationMethod: string,
  challenge?: string
): VerifiablePresentation {
  const { proof, ...presentationWithoutProof } = presentation;
  const jws = createJWS(presentationWithoutProof as Record<string, unknown>, privateKey);
  
  const newProof: CredentialProof = {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod,
    proofPurpose: 'authentication',
    jws
  };
  
  if (challenge) {
    newProof.challenge = challenge;
  }
  
  return {
    ...presentationWithoutProof,
    proof: newProof
  } as VerifiablePresentation;
}

/**
 * Verifies a presentation's signature using a raw public key.
 * @param presentation Signed VP
 * @param publicKey Signer's public key
 * @returns true if signature is valid
 */
export function verifyPresentationSignature(presentation: VerifiablePresentation, publicKey: Uint8Array): boolean {
  if (!presentation.proof) return false;
  
  const proof = Array.isArray(presentation.proof) ? presentation.proof[0] : presentation.proof;
  if (!proof.jws) return false;
  
  const result = verifyJWS(proof.jws, publicKey);
  return result.valid;
}

/**
 * Full presentation verification using a DID resolver.
 *
 * Performs multi-layer verification:
 * 1. Resolves the holder's DID and verifies the VP proof signature
 * 2. Verifies each embedded VC's issuer signature via the resolver
 *
 * Returns a structured {@link VerificationResult} with:
 * - `holderVerified`: holder's DID resolved and VP signature valid
 * - `issuerVerified`: all embedded VC issuer signatures valid
 * - `proofVerified`: all cryptographic proofs valid
 *
 * @param presentation The signed Verifiable Presentation to verify
 * @param resolver A DIDResolver instance (e.g. from `createResolver()`)
 * @returns A structured verification result
 */
export async function verifyPresentation(
  presentation: VerifiablePresentation,
  resolver: DIDResolver,
): Promise<VerificationResult> {
  const result: VerificationResult = {
    valid: false,
    issuerVerified: false,
    holderVerified: false,
    proofVerified: false,
    revocationChecked: false,
    errors: [],
  };

  // 1. Verify the holder's VP proof
  if (!presentation.proof) {
    result.errors.push('Presentation has no proof');
    return result;
  }

  const vpProof = Array.isArray(presentation.proof) ? presentation.proof[0] : presentation.proof;
  if (!vpProof.jws) {
    result.errors.push('Presentation proof has no JWS');
    return result;
  }

  // Resolve the holder DID from the proof's verificationMethod
  // The verificationMethod is like "did:key:z6Mk...#z6Mk...", extract the DID part
  const holderDid = presentation.holder || vpProof.verificationMethod.split('#')[0];
  let holderPublicKey: Uint8Array | null = null;

  try {
    const holderDoc = await resolver.resolve(holderDid);
    holderPublicKey = resolver.extractPublicKey(holderDoc);
  } catch (err) {
    result.errors.push(`Failed to resolve holder DID "${holderDid}": ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  if (!holderPublicKey) {
    result.errors.push(`No public key found in holder DID Document for "${holderDid}"`);
    return result;
  }

  const holderJwsResult = verifyJWS(vpProof.jws, holderPublicKey);
  if (!holderJwsResult.valid) {
    result.errors.push('Presentation holder signature verification failed');
    return result;
  }

  result.holderVerified = true;

  // 2. Verify each embedded credential's issuer signature
  const credentials = presentation.verifiableCredential || [];
  let allIssuersVerified = true;

  for (let i = 0; i < credentials.length; i++) {
    const vc = credentials[i];
    const vcResult = await verifyCredential(vc, resolver);

    if (!vcResult.valid) {
      allIssuersVerified = false;
      for (const err of vcResult.errors) {
        result.errors.push(`Credential[${i}]: ${err}`);
      }
    }
  }

  result.issuerVerified = allIssuersVerified;
  result.proofVerified = result.holderVerified && result.issuerVerified;
  result.valid = result.proofVerified;

  return result;
}

