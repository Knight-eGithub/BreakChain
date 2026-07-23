import { ed25519 } from '@noble/curves/ed25519';
import { base58btcEncode, base58btcDecode } from './encoding';

export type Ed25519KeyPair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

/**
 * Generates a random Ed25519 keypair.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/**
 * Derives public key from private key.
 */
export function getPublicKey(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey);
}

const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01]);

/**
 * Encodes a public key as multibase base58btc with Ed25519 multicodec prefix.
 */
export function publicKeyToMultibase(publicKey: Uint8Array): string {
  const payload = new Uint8Array(ED25519_MULTICODEC.length + publicKey.length);
  payload.set(ED25519_MULTICODEC);
  payload.set(publicKey, ED25519_MULTICODEC.length);
  return 'z' + base58btcEncode(payload);
}

/**
 * Decodes a multibase string into an Ed25519 public key.
 */
export function multibaseToPublicKey(multibase: string): Uint8Array {
  if (!multibase.startsWith('z')) {
    throw new Error('Invalid multibase prefix, expected "z"');
  }
  const payload = base58btcDecode(multibase.substring(1));
  if (payload.length < 2 || payload[0] !== 0xed || payload[1] !== 0x01) {
    throw new Error('Invalid multicodec prefix, expected 0xed01');
  }
  return payload.slice(2);
}
