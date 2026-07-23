/**
 * W3C DID types
 */

export type DIDMethod = 'key' | 'web';

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyJwk?: Record<string, unknown>;
  publicKeyMultibase?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string | string[];
}

export interface DIDDocument {
  '@context'?: string | string[];
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  service?: ServiceEndpoint[];
}

export interface DIDResolutionResult {
  didDocument: DIDDocument | null;
  didResolutionMetadata: Record<string, unknown>;
  didDocumentMetadata: Record<string, unknown>;
}
