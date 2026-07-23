/**
 * OpenID4VCI/VP protocol types
 */
import { CredentialFormat } from './credentials';

export interface CredentialOffer {
  credential_issuer: string;
  credential_configuration_ids: string[];
  grants?: {
    authorization_code?: {
      issuer_state?: string;
    };
    'urn:ietf:params:oauth:grant-type:pre-authorized_code'?: {
      'pre-authorized_code': string;
      user_pin_required?: boolean;
    };
  };
}

export interface TokenRequest {
  grant_type: string;
  code?: string;
  pre_authorized_code?: string;
  code_verifier?: string;
  user_pin?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  c_nonce?: string;
  c_nonce_expires_in?: number;
}

export interface CredentialRequest {
  format: CredentialFormat;
  credential_identifier?: string;
  proof?: {
    proof_type: string;
    jwt: string;
  };
}

export interface CredentialResponse {
  format: CredentialFormat;
  credential: string;
  c_nonce?: string;
  c_nonce_expires_in?: number;
}

export interface FieldConstraint {
  path: string[];
  filter?: {
    type: string;
    const?: unknown;
    minimum?: number;
    maximum?: number;
    pattern?: string;
  };
}

export interface InputDescriptor {
  id: string;
  name?: string;
  purpose?: string;
  constraints: {
    fields: FieldConstraint[];
  };
}

export interface PresentationDefinition {
  id: string;
  name?: string;
  purpose?: string;
  input_descriptors: InputDescriptor[];
}

export interface IssuerMetadata {
  credential_issuer: string;
  credential_endpoint: string;
  token_endpoint?: string;
  authorization_endpoint?: string;
  credential_configurations_supported: Record<string, {
    format: string;
    scope?: string;
    credential_definition?: Record<string, unknown>;
  }>;
}
