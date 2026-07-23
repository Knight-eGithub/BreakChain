import { randomBytes } from '@noble/hashes/utils';
import { base64urlEncode } from './encoding';

/**
 * Generates random bytes and returns as base64url string.
 */
export function generateSalt(byteLength: number = 16): string {
  const bytes = randomBytes(byteLength);
  return base64urlEncode(bytes);
}
