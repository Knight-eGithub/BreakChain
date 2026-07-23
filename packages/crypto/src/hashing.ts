import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, base64urlEncode, utf8ToBytes } from './encoding';

/**
 * Computes SHA-256 hash of a Uint8Array.
 */
export function sha256Hash(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/**
 * Computes SHA-256 hash as hex string.
 */
export function sha256Hex(data: Uint8Array): string {
  return bytesToHex(sha256(data));
}

/**
 * Computes SHA-256 hash as base64url string.
 */
export function sha256Base64Url(data: Uint8Array): string {
  return base64urlEncode(sha256(data));
}

/**
 * Computes SHA-256 hash of a UTF-8 string and returns as hex string.
 */
export function sha256String(str: string): string {
  return sha256Hex(utf8ToBytes(str));
}
