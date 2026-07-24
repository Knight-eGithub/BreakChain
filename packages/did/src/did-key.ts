import type {
  DIDDocument,
  DIDResolutionResult,
  VerificationMethod,
} from '@ciphera/core';
import {
  publicKeyToMultibase,
  multibaseToPublicKey,
  publicKeyToJwk,
} from '@ciphera/crypto';

/** Ed25519 multicodec prefix used to identify did:key Ed25519 keys */
const DID_KEY_PREFIX = 'did:key:';
const ED25519_VERIFICATION_KEY_TYPE = 'Ed25519VerificationKey2020';
const W3C_DID_CONTEXT = 'https://www.w3.org/ns/did/v1';
const ED25519_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1';

/**
 * Generates a `did:key` identifier from a raw Ed25519 public key.
 *
 * The DID is formed as `did:key:<multibase>` where multibase is the
 * base58btc encoding of the Ed25519 multicodec prefix (0xed01) + public key.
 *
 * @param publicKey - Raw 32-byte Ed25519 public key
 * @returns The `did:key:z6Mk...` string
 */
export function generateDidKey(publicKey: Uint8Array): string {
  const multibase = publicKeyToMultibase(publicKey);
  return `${DID_KEY_PREFIX}${multibase}`;
}

/**
 * Extracts the raw Ed25519 public key from a `did:key` identifier.
 *
 * @param did - A `did:key:z6Mk...` string
 * @returns Raw 32-byte Ed25519 public key
 * @throws If the DID is not a valid did:key
 */
export function didKeyToPublicKey(did: string): Uint8Array {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new Error(`Invalid did:key — expected prefix "${DID_KEY_PREFIX}", got "${did}"`);
  }
  const multibase = did.slice(DID_KEY_PREFIX.length);
  return multibaseToPublicKey(multibase);
}

/**
 * Resolves a `did:key` identifier into a DID Document.
 *
 * No network calls are made — the DID Document is derived entirely
 * from the public key encoded in the DID itself.
 *
 * @param did - A `did:key:z6Mk...` string
 * @returns A W3C DID Document
 */
export function resolveDidKey(did: string): DIDDocument {
  const publicKey = didKeyToPublicKey(did);
  const multibase = did.slice(DID_KEY_PREFIX.length);
  const keyId = `${did}#${multibase}`;

  const verificationMethod: VerificationMethod = {
    id: keyId,
    type: ED25519_VERIFICATION_KEY_TYPE,
    controller: did,
    publicKeyMultibase: multibase,
    publicKeyJwk: publicKeyToJwk(publicKey) as unknown as Record<string, unknown>,
  };

  return {
    '@context': [W3C_DID_CONTEXT, ED25519_CONTEXT],
    id: did,
    verificationMethod: [verificationMethod],
    authentication: [keyId],
    assertionMethod: [keyId],
  };
}

/**
 * Resolves a `did:key` and returns a full DID Resolution Result.
 *
 * @param did - A `did:key:z6Mk...` string
 * @returns DIDResolutionResult with the resolved document or error metadata
 */
export function resolveDidKeyFull(did: string): DIDResolutionResult {
  try {
    const didDocument = resolveDidKey(did);
    return {
      didDocument,
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocumentMetadata: {},
    };
  } catch (error) {
    return {
      didDocument: null,
      didResolutionMetadata: {
        error: 'invalidDid',
        message: error instanceof Error ? error.message : String(error),
      },
      didDocumentMetadata: {},
    };
  }
}
