import type {
  DIDDocument,
  DIDResolutionResult,
  DIDMethod,
} from '@breakchain/core';
import { multibaseToPublicKey, base64urlDecode } from '@breakchain/crypto';
import { resolveDidKey, resolveDidKeyFull, generateDidKey, didKeyToPublicKey } from './did-key';
import { resolveDidWeb, resolveDidWebFull, didWebToUrl } from './did-web';

/**
 * A unified DID resolver that auto-detects the method (did:key or did:web)
 * and delegates to the appropriate resolver.
 */
export interface DIDResolver {
  /** Resolve a DID to a DID Document */
  resolve(did: string): Promise<DIDDocument>;
  /** Resolve a DID to a full DID Resolution Result (includes metadata) */
  resolveFull(did: string): Promise<DIDResolutionResult>;
  /** Extract the first public key bytes from a resolved DID Document */
  extractPublicKey(didDoc: DIDDocument): Uint8Array | null;
}

/**
 * Detects the DID method from a DID string.
 *
 * @param did - A DID string (e.g. `did:key:z6Mk...` or `did:web:example.com`)
 * @returns The method name ('key' or 'web')
 * @throws If the DID method is not supported
 */
export function detectMethod(did: string): DIDMethod {
  if (did.startsWith('did:key:')) return 'key';
  if (did.startsWith('did:web:')) return 'web';
  throw new Error(`Unsupported DID method in "${did}". Supported: did:key, did:web`);
}

/**
 * Extracts the first public key (as raw bytes) from a DID Document's
 * verificationMethod array. Supports publicKeyMultibase (Ed25519) and
 * publicKeyJwk (OKP/Ed25519) formats.
 *
 * @param didDoc - A resolved DID Document
 * @returns Raw public key bytes, or null if no key found
 */
export function extractPublicKeyFromDoc(didDoc: DIDDocument): Uint8Array | null {
  if (!didDoc.verificationMethod || didDoc.verificationMethod.length === 0) {
    return null;
  }

  const vm = didDoc.verificationMethod[0];

  // Try multibase first (Ed25519 did:key style)
  if (vm.publicKeyMultibase) {
    return multibaseToPublicKey(vm.publicKeyMultibase);
  }

  // Try JWK (OKP/Ed25519)
  if (vm.publicKeyJwk) {
    const jwk = vm.publicKeyJwk as Record<string, unknown>;
    if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519' && typeof jwk.x === 'string') {
      return base64urlDecode(jwk.x as string);
    }
  }

  return null;
}

/**
 * Creates a unified DID resolver that handles both did:key and did:web.
 *
 * @returns A DIDResolver instance
 */
export function createResolver(): DIDResolver {
  return {
    async resolve(did: string): Promise<DIDDocument> {
      const method = detectMethod(did);
      switch (method) {
        case 'key':
          return resolveDidKey(did);
        case 'web':
          return resolveDidWeb(did);
        default:
          throw new Error(`Unsupported DID method: ${method}`);
      }
    },

    async resolveFull(did: string): Promise<DIDResolutionResult> {
      const method = detectMethod(did);
      switch (method) {
        case 'key':
          return resolveDidKeyFull(did);
        case 'web':
          return resolveDidWebFull(did);
        default:
          return {
            didDocument: null,
            didResolutionMetadata: { error: 'methodNotSupported' },
            didDocumentMetadata: {},
          };
      }
    },

    extractPublicKey(didDoc: DIDDocument): Uint8Array | null {
      return extractPublicKeyFromDoc(didDoc);
    },
  };
}
