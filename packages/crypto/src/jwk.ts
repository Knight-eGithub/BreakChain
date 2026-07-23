import { base64urlEncode, base64urlDecode } from './encoding';

export type Ed25519JWK = {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  d?: string;
};

/**
 * Converts a raw Ed25519 public key to JWK.
 */
export function publicKeyToJwk(publicKey: Uint8Array): Ed25519JWK {
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64urlEncode(publicKey)
  };
}

/**
 * Converts an Ed25519 private and public key to JWK.
 */
export function privateKeyToJwk(privateKey: Uint8Array, publicKey: Uint8Array): Ed25519JWK {
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64urlEncode(publicKey),
    d: base64urlEncode(privateKey)
  };
}

/**
 * Extracts and decodes the public key from a JWK.
 */
export function jwkToPublicKey(jwk: Ed25519JWK): Uint8Array {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
    throw new Error('Invalid JWK type or curve');
  }
  return base64urlDecode(jwk.x);
}

/**
 * Extracts and decodes the private key from a JWK.
 */
export function jwkToPrivateKey(jwk: Ed25519JWK): Uint8Array {
  if (!jwk.d) {
    throw new Error('JWK does not contain private key');
  }
  return base64urlDecode(jwk.d);
}
