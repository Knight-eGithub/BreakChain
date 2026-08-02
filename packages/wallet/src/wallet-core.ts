/**
 * WalletCore — Identity management, credential storage, and credential verification.
 *
 * The WalletCore manages the holder's DID identity (via did:key) and stores
 * Verifiable Credentials. It verifies issuer signatures on import and provides
 * credential lookup by InputDescriptor matching.
 */
import type {
  VerifiableCredential,
  InputDescriptor,
  FieldConstraint,
} from '@breakchain/core';
import type { KeyStore } from '@breakchain/crypto';
import { InMemoryKeyStore, createJWS } from '@breakchain/crypto';
import { createResolver, generateDidKey } from '@breakchain/did';
import type { DIDResolver } from '@breakchain/did';
import { verifyCredential } from '@breakchain/credentials';

export interface WalletCoreOptions {
  /** Optional external KeyStore. Defaults to InMemoryKeyStore. */
  keyStore?: KeyStore;
  /** Whether to verify issuer signatures when adding credentials. Default: true */
  verifyOnImport?: boolean;
}

export class WalletCore {
  private keyStore: KeyStore;
  private credentials: Map<string, VerifiableCredential> = new Map();
  private holderDid: string | null = null;
  private resolver: DIDResolver;
  private verifyOnImport: boolean;

  constructor(options?: WalletCoreOptions) {
    this.keyStore = options?.keyStore || new InMemoryKeyStore();
    this.verifyOnImport = options?.verifyOnImport ?? true;
    this.resolver = createResolver();
  }

  /**
   * Initializes the wallet by generating a new Ed25519 keypair and deriving a did:key.
   * @returns The wallet's DID (did:key:z6Mk...)
   */
  async initialize(): Promise<string> {
    const { id } = await this.keyStore.generateKeyPair();
    this.holderDid = id;
    return id;
  }

  /**
   * Returns the wallet's DID. Throws if not initialized.
   */
  getDid(): string {
    if (!this.holderDid) {
      throw new Error('Wallet not initialized. Call initialize() first.');
    }
    return this.holderDid;
  }

  /**
   * Returns the underlying KeyStore.
   */
  getKeyStore(): KeyStore {
    return this.keyStore;
  }

  /**
   * Returns the DID resolver instance.
   */
  getResolver(): DIDResolver {
    return this.resolver;
  }

  /**
   * Adds a Verifiable Credential to the wallet store.
   * If verifyOnImport is true, verifies the issuer's signature first.
   *
   * @param credential The VC to store
   * @throws If verification fails
   */
  async addCredential(credential: VerifiableCredential): Promise<void> {
    if (this.verifyOnImport && credential.proof) {
      const result = await verifyCredential(credential, this.resolver);
      if (!result.valid) {
        throw new Error(
          `Credential verification failed: ${result.errors.join('; ')}`
        );
      }
    }

    const id = credential.id || `urn:uuid:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.credentials.set(id, credential);
  }

  /**
   * Returns all stored credentials.
   */
  async getCredentials(): Promise<VerifiableCredential[]> {
    return Array.from(this.credentials.values());
  }

  /**
   * Returns a credential by its ID.
   */
  async getCredentialById(id: string): Promise<VerifiableCredential | null> {
    return this.credentials.get(id) || null;
  }

  /**
   * Returns the number of stored credentials.
   */
  getCredentialCount(): number {
    return this.credentials.size;
  }

  /**
   * Finds credentials matching a set of InputDescriptors from a PresentationDefinition.
   *
   * Matching is done by checking if the credential's type or credentialSubject fields
   * match the descriptor's field constraints.
   *
   * @param descriptors Array of InputDescriptors to match against
   * @returns Array of matching credentials
   */
  async findCredentials(descriptors: InputDescriptor[]): Promise<VerifiableCredential[]> {
    const allCreds = Array.from(this.credentials.values());
    const matched: VerifiableCredential[] = [];

    for (const cred of allCreds) {
      let credMatches = false;

      for (const descriptor of descriptors) {
        if (this.credentialMatchesDescriptor(cred, descriptor)) {
          credMatches = true;
          break;
        }
      }

      if (credMatches) {
        matched.push(cred);
      }
    }

    return matched;
  }

  /**
   * Creates a proof-of-possession JWS for the c_nonce during credential issuance.
   * Signs { nonce: c_nonce, iss: holderDid, iat: now } with the holder's key.
   */
  async createProofOfPossession(cNonce: string): Promise<string> {
    const did = this.getDid();
    const publicKey = await this.keyStore.getPublicKey(did);
    if (!publicKey) {
      throw new Error('Holder key not found');
    }

    // Sign the nonce using the keystore
    const payload = {
      nonce: cNonce,
      iss: did,
      iat: Math.floor(Date.now() / 1000),
    };

    // We need to get the private key to create a JWS
    // The KeyStore.sign() method signs raw data, but we need to create a JWS
    // So we'll sign the data manually through the keystore
    const headerB64 = base64urlEncode(JSON.stringify({ alg: 'EdDSA', typ: 'openid4vci-proof+jwt' }));
    const payloadB64 = base64urlEncode(JSON.stringify(payload));
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = await this.keyStore.sign(did, signingInput);
    const sigB64 = base64urlEncodeBytes(signature);

    return `${headerB64}.${payloadB64}.${sigB64}`;
  }

  /**
   * Signs arbitrary data using the holder's key via the KeyStore.
   */
  async signData(data: Uint8Array): Promise<Uint8Array> {
    const did = this.getDid();
    return this.keyStore.sign(did, data);
  }

  /**
   * Checks if a credential matches an InputDescriptor by examining field constraints.
   */
  private credentialMatchesDescriptor(
    credential: VerifiableCredential,
    descriptor: InputDescriptor
  ): boolean {
    const fields = descriptor.constraints?.fields;
    if (!fields || fields.length === 0) return true;

    // Check each field constraint
    for (const field of fields) {
      if (!this.credentialHasField(credential, field)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if a credential has a field matching a FieldConstraint.
   * Supports JSONPath-like paths: $.type, $.credentialSubject.age, etc.
   */
  private credentialHasField(
    credential: VerifiableCredential,
    field: FieldConstraint
  ): boolean {
    for (const path of field.path) {
      const value = this.resolveJsonPath(credential as unknown as Record<string, unknown>, path);
      if (value !== undefined) {
        // If there's a filter, check it
        if (field.filter) {
          if (field.filter.const !== undefined && value !== field.filter.const) continue;
          if (field.filter.minimum !== undefined && typeof value === 'number' && value < field.filter.minimum) continue;
          if (field.filter.pattern !== undefined && typeof value === 'string' && !new RegExp(field.filter.pattern).test(value)) continue;
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Simple JSONPath resolver for credential fields.
   * Supports paths like: $.type, $.credentialSubject.name, $.credentialSubject.age
   */
  private resolveJsonPath(obj: Record<string, unknown>, path: string): unknown {
    // Remove the leading $. if present
    const normalizedPath = path.startsWith('$.') ? path.slice(2) : path;
    const parts = normalizedPath.split('.');

    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}

/** Base64url encode a string (UTF-8) */
function base64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return base64urlEncodeBytes(bytes);
}

/** Base64url encode bytes */
function base64urlEncodeBytes(data: Uint8Array): string {
  // Use Buffer in Node.js
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64url');
  }
  // Fallback for browser
  const binString = Array.from(data, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
