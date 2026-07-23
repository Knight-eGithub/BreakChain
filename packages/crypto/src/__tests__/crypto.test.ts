import { describe, it, expect } from 'vitest';
import { 
  generateEd25519KeyPair, getPublicKey, publicKeyToMultibase, multibaseToPublicKey 
} from '../keys';
import { sign, verify } from '../signing';
import { sha256Hex, sha256Hash, sha256String } from '../hashing';
import { 
  base64urlEncode, base64urlDecode, base58btcEncode, base58btcDecode, utf8ToBytes, bytesToHex 
} from '../encoding';
import { publicKeyToJwk, privateKeyToJwk, jwkToPublicKey, jwkToPrivateKey } from '../jwk';
import { createJWS, verifyJWS, decodeJWS } from '../jws';
import { generateCodeVerifier, generateCodeChallenge } from '../pkce';
import { generateSalt } from '../salt';
import { InMemoryKeyStore } from '../key-store';

describe('Crypto Package', () => {
  it('Key Generation: should generate a valid ed25519 keypair', () => {
    const keypair = generateEd25519KeyPair();
    expect(keypair.publicKey.length).toBe(32);
    expect(keypair.privateKey.length).toBe(32);
    expect(getPublicKey(keypair.privateKey)).toEqual(keypair.publicKey);
  });

  it('Sign/Verify: should sign and verify messages correctly', () => {
    const keypair = generateEd25519KeyPair();
    const wrongKeypair = generateEd25519KeyPair();
    const message = utf8ToBytes('hello world');
    
    const signature = sign(keypair.privateKey, message);
    expect(signature.length).toBe(64);
    
    // Correct key
    expect(verify(keypair.publicKey, message, signature)).toBe(true);
    
    // Wrong key
    expect(verify(wrongKeypair.publicKey, message, signature)).toBe(false);
    
    // Tampered signature
    const tamperedSignature = new Uint8Array(signature);
    tamperedSignature[0] ^= 1;
    expect(verify(keypair.publicKey, message, tamperedSignature)).toBe(false);
  });

  it('Hashing: should compute SHA-256 hashes correctly', () => {
    const msg = 'test';
    // SHA-256 of "test" is 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
    const expectedHex = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    expect(sha256Hex(utf8ToBytes(msg))).toBe(expectedHex);
    expect(sha256String(msg)).toBe(expectedHex);
    expect(bytesToHex(sha256Hash(utf8ToBytes(msg)))).toBe(expectedHex);
  });

  it('Encoding: base64url round-trip', () => {
    const data = utf8ToBytes('Hello, base64url!');
    const encoded = base64urlEncode(data);
    expect(encoded).not.toContain('=');
    expect(base64urlDecode(encoded)).toEqual(data);
  });

  it('Encoding: multibase encode/decode', () => {
    const keypair = generateEd25519KeyPair();
    const multibase = publicKeyToMultibase(keypair.publicKey);
    expect(multibase.startsWith('z')).toBe(true);
    
    const decoded = multibaseToPublicKey(multibase);
    expect(decoded).toEqual(keypair.publicKey);
  });

  it('JWK: public and private key conversion', () => {
    const keypair = generateEd25519KeyPair();
    
    const pubJwk = publicKeyToJwk(keypair.publicKey);
    expect(pubJwk.kty).toBe('OKP');
    expect(pubJwk.crv).toBe('Ed25519');
    expect(jwkToPublicKey(pubJwk)).toEqual(keypair.publicKey);
    
    const privJwk = privateKeyToJwk(keypair.privateKey, keypair.publicKey);
    expect(privJwk.d).toBeDefined();
    expect(jwkToPrivateKey(privJwk)).toEqual(keypair.privateKey);
  });

  it('JWS: create and verify compact JWS', () => {
    const keypair = generateEd25519KeyPair();
    const wrongKeypair = generateEd25519KeyPair();
    const payload = { sub: 'user123', aud: 'test' };
    
    const jws = createJWS(payload, keypair.privateKey, { kid: 'key1' });
    expect(jws.split('.').length).toBe(3);
    
    const { valid, header, payload: decodedPayload } = verifyJWS(jws, keypair.publicKey);
    expect(valid).toBe(true);
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe('key1');
    expect(decodedPayload).toEqual(payload);
    
    const decoded = decodeJWS(jws);
    expect(decoded.header).toEqual(header);
    expect(decoded.payload).toEqual(payload);
    
    const wrongVerify = verifyJWS(jws, wrongKeypair.publicKey);
    expect(wrongVerify.valid).toBe(false);
  });

  it('PKCE: generate verifier and challenge', () => {
    const verifier = generateCodeVerifier(50);
    expect(verifier.length).toBe(50);
    
    const challenge = generateCodeChallenge(verifier);
    const expectedChallenge = base64urlEncode(sha256Hash(utf8ToBytes(verifier)));
    expect(challenge).toBe(expectedChallenge);
  });

  it('Salt: generate random salt', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    expect(typeof salt1).toBe('string');
    expect(salt1.length).toBeGreaterThan(0);
    expect(salt1).not.toBe(salt2);
  });

  it('KeyStore: InMemoryKeyStore operations', async () => {
    const store = new InMemoryKeyStore();
    const { id, publicKey } = await store.generateKeyPair();
    
    expect(id.startsWith('did:key:z')).toBe(true);
    expect(await store.has(id)).toBe(true);
    expect(await store.getPublicKey(id)).toEqual(publicKey);
    
    const keys = await store.listKeyIds();
    expect(keys).toContain(id);
    
    const message = utf8ToBytes('store test');
    const signature = await store.sign(id, message);
    expect(verify(publicKey, message, signature)).toBe(true);
    
    await store.deleteKey(id);
    expect(await store.has(id)).toBe(false);
  });
});
