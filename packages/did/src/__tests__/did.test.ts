import { describe, it, expect } from 'vitest';
import {
  generateDidKey,
  didKeyToPublicKey,
  resolveDidKey,
  resolveDidKeyFull,
  didWebToUrl,
  createResolver,
  detectMethod,
  extractPublicKeyFromDoc,
} from '../index';
import { generateEd25519KeyPair, publicKeyToMultibase } from '@ciphera/crypto';

describe('did:key', () => {
  it('generates a valid did:key from a public key', () => {
    const { publicKey } = generateEd25519KeyPair();
    const did = generateDidKey(publicKey);
    expect(did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it('extracts the public key back from a did:key', () => {
    const { publicKey } = generateEd25519KeyPair();
    const did = generateDidKey(publicKey);
    const extracted = didKeyToPublicKey(did);
    expect(extracted).toEqual(publicKey);
  });

  it('resolves a did:key to a DID Document', () => {
    const { publicKey } = generateEd25519KeyPair();
    const did = generateDidKey(publicKey);
    const doc = resolveDidKey(did);

    expect(doc.id).toBe(did);
    expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
    expect(doc.verificationMethod).toHaveLength(1);

    const vm = doc.verificationMethod![0];
    expect(vm.type).toBe('Ed25519VerificationKey2020');
    expect(vm.controller).toBe(did);
    expect(vm.publicKeyMultibase).toBe(publicKeyToMultibase(publicKey));
    expect(vm.publicKeyJwk).toBeDefined();
    expect((vm.publicKeyJwk as any).kty).toBe('OKP');
    expect((vm.publicKeyJwk as any).crv).toBe('Ed25519');

    // Fragment ID should be did#multibase
    const multibase = publicKeyToMultibase(publicKey);
    expect(vm.id).toBe(`${did}#${multibase}`);

    // Authentication and assertionMethod should reference the key
    expect(doc.authentication).toContain(vm.id);
    expect(doc.assertionMethod).toContain(vm.id);
  });

  it('resolveDidKeyFull returns success metadata', () => {
    const { publicKey } = generateEd25519KeyPair();
    const did = generateDidKey(publicKey);
    const result = resolveDidKeyFull(did);

    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe(did);
    expect(result.didResolutionMetadata.contentType).toBe('application/did+ld+json');
  });

  it('resolveDidKeyFull returns error for invalid DID', () => {
    const result = resolveDidKeyFull('did:key:invalid');
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe('invalidDid');
  });

  it('throws for non-did:key input', () => {
    expect(() => didKeyToPublicKey('did:web:example.com')).toThrow('expected prefix');
  });
});

describe('did:web URL transformation', () => {
  it('converts domain-only did:web to .well-known URL', () => {
    expect(didWebToUrl('did:web:example.com')).toBe(
      'https://example.com/.well-known/did.json'
    );
  });

  it('converts did:web with path to path-based URL', () => {
    expect(didWebToUrl('did:web:example.com:user:alice')).toBe(
      'https://example.com/user/alice/did.json'
    );
  });

  it('handles URL-encoded ports', () => {
    expect(didWebToUrl('did:web:example.com%3A3001')).toBe(
      'https://example.com:3001/.well-known/did.json'
    );
  });

  it('handles URL-encoded port with path', () => {
    expect(didWebToUrl('did:web:example.com%3A3001:api:dids')).toBe(
      'https://example.com:3001/api/dids/did.json'
    );
  });

  it('throws for non-did:web input', () => {
    expect(() => didWebToUrl('did:key:z6Mk...')).toThrow('expected prefix');
  });
});

describe('Unified resolver', () => {
  it('detects did:key method', () => {
    expect(detectMethod('did:key:z6Mk...')).toBe('key');
  });

  it('detects did:web method', () => {
    expect(detectMethod('did:web:example.com')).toBe('web');
  });

  it('throws for unsupported method', () => {
    expect(() => detectMethod('did:example:123')).toThrow('Unsupported DID method');
  });

  it('resolves did:key via createResolver', async () => {
    const { publicKey } = generateEd25519KeyPair();
    const did = generateDidKey(publicKey);
    const resolver = createResolver();
    const doc = await resolver.resolve(did);

    expect(doc.id).toBe(did);
    expect(doc.verificationMethod).toHaveLength(1);
  });

  it('resolves did:key full via createResolver', async () => {
    const { publicKey } = generateEd25519KeyPair();
    const did = generateDidKey(publicKey);
    const resolver = createResolver();
    const result = await resolver.resolveFull(did);

    expect(result.didDocument).not.toBeNull();
    expect(result.didDocument!.id).toBe(did);
  });
});

describe('extractPublicKeyFromDoc', () => {
  it('extracts public key from a resolved did:key document', () => {
    const { publicKey } = generateEd25519KeyPair();
    const did = generateDidKey(publicKey);
    const doc = resolveDidKey(did);

    const extracted = extractPublicKeyFromDoc(doc);
    expect(extracted).not.toBeNull();
    expect(extracted).toEqual(publicKey);
  });

  it('returns null for empty verificationMethod', () => {
    const doc = { id: 'did:example:test' };
    const result = extractPublicKeyFromDoc(doc);
    expect(result).toBeNull();
  });
});
