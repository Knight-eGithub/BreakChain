import type {
  DIDDocument,
  DIDResolutionResult,
} from '@ciphera/core';

const DID_WEB_PREFIX = 'did:web:';

/**
 * Transforms a `did:web` identifier into the HTTPS URL where the
 * DID Document should be hosted.
 *
 * Transformation rules (W3C DID Web Method Spec):
 * - `did:web:example.com` → `https://example.com/.well-known/did.json`
 * - `did:web:example.com:path:to` → `https://example.com/path/to/did.json`
 * - `did:web:example.com%3A3001` → `https://example.com:3001/.well-known/did.json`
 *
 * @param did - A `did:web:...` string
 * @returns The HTTPS URL for the DID Document
 */
export function didWebToUrl(did: string): string {
  if (!did.startsWith(DID_WEB_PREFIX)) {
    throw new Error(`Invalid did:web — expected prefix "${DID_WEB_PREFIX}", got "${did}"`);
  }

  const methodSpecific = did.slice(DID_WEB_PREFIX.length);
  // Split by ':' to get path segments
  const parts = methodSpecific.split(':');
  // First part is the domain (URL-decode to restore port colons etc.)
  const domain = decodeURIComponent(parts[0]);

  if (parts.length === 1) {
    // No path — use /.well-known/did.json
    return `https://${domain}/.well-known/did.json`;
  }

  // Remaining parts are path segments (each URL-decoded)
  const pathSegments = parts.slice(1).map(decodeURIComponent);
  return `https://${domain}/${pathSegments.join('/')}/did.json`;
}

/**
 * Resolves a `did:web` identifier by fetching the DID Document
 * from the corresponding HTTPS URL.
 *
 * @param did - A `did:web:...` string
 * @returns The fetched and parsed DID Document
 * @throws If the fetch fails or the response is not valid JSON
 */
export async function resolveDidWeb(did: string): Promise<DIDDocument> {
  const url = didWebToUrl(did);

  const response = await fetch(url, {
    headers: { Accept: 'application/did+ld+json, application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve ${did}: HTTP ${response.status} ${response.statusText}`);
  }

  const didDocument = (await response.json()) as DIDDocument;

  // Basic validation: the DID Document's id should match the DID
  if (didDocument.id !== did) {
    throw new Error(
      `DID Document id mismatch: expected "${did}", got "${didDocument.id}"`
    );
  }

  return didDocument;
}

/**
 * Resolves a `did:web` and returns a full DID Resolution Result.
 *
 * @param did - A `did:web:...` string
 * @returns DIDResolutionResult with the resolved document or error metadata
 */
export async function resolveDidWebFull(did: string): Promise<DIDResolutionResult> {
  try {
    const didDocument = await resolveDidWeb(did);
    return {
      didDocument,
      didResolutionMetadata: { contentType: 'application/did+ld+json' },
      didDocumentMetadata: {},
    };
  } catch (error) {
    return {
      didDocument: null,
      didResolutionMetadata: {
        error: 'notFound',
        message: error instanceof Error ? error.message : String(error),
      },
      didDocumentMetadata: {},
    };
  }
}
