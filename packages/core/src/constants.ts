/**
 * Core SDK constants
 */
import { SDKConfig } from './types/sdk';

export const SUPPORTED_ALGORITHMS = {
  signing: ['EdDSA', 'ES256'] as const,
  hashing: ['SHA-256'] as const,
  zkProof: ['groth16', 'plonk', 'honk'] as const,
};

export const CREDENTIAL_FORMATS = ['ldp_vc', 'jwt_vc', 'sd-jwt'] as const;

export const DID_METHODS = ['key', 'web'] as const;

export const PROOF_PURPOSES = ['assertionMethod', 'authentication'] as const;

export const W3C_CREDENTIALS_CONTEXT = 'https://www.w3.org/ns/credentials/v2';
export const W3C_DID_CONTEXT = 'https://www.w3.org/ns/did/v1';
export const STATUS_LIST_2021_CONTEXT = 'https://w3id.org/vc-revocation-list-2021/v1';

export const DEFAULT_SDK_CONFIG: Partial<SDKConfig> = {
  verificationMode: 'local',
  revocationCheck: true,
  defaultProofMode: 'zkp',
  timeout: 30000,
};
