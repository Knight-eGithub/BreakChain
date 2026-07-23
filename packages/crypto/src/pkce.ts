import { randomBytes } from '@noble/hashes/utils';
import { base64urlEncode, utf8ToBytes } from './encoding';
import { sha256Hash } from './hashing';

/**
 * Generates a random URL-safe string for PKCE.
 */
export function generateCodeVerifier(length: number = 43): string {
  const bytes = randomBytes(length);
  const verifier = base64urlEncode(bytes);
  return verifier.substring(0, length);
}

/**
 * Generates a PKCE code challenge.
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = sha256Hash(utf8ToBytes(verifier));
  return base64urlEncode(hash);
}
