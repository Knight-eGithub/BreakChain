/**
 * W3C Verifiable Credentials Data Model v2 types
 */

export type JsonLdContext = string | Record<string, unknown>;

export interface CredentialSubject {
  id?: string;
  [key: string]: unknown;
}

export interface CredentialProof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  jws?: string;
  proofValue?: string;
  challenge?: string;
  [key: string]: unknown;
}

export interface CredentialStatus {
  id: string;
  type: string;
  statusListIndex?: string;
  statusListCredential?: string;
  statusPurpose?: string;
}

export type CredentialFormat = 'ldp_vc' | 'jwt_vc' | 'sd-jwt';

export interface VerifiableCredential {
  '@context': JsonLdContext | JsonLdContext[];
  id: string;
  type: string[];
  issuer: string | { id: string; [key: string]: unknown };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: CredentialSubject | CredentialSubject[];
  proof?: CredentialProof | CredentialProof[];
  credentialStatus?: CredentialStatus;
}

export interface VerifiablePresentation {
  '@context': JsonLdContext | JsonLdContext[];
  type: string[];
  verifiableCredential: VerifiableCredential[];
  holder?: string;
  proof?: CredentialProof | CredentialProof[];
}
