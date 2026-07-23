import { base58, base64urlnopad } from '@scure/base';

/**
 * Encodes a Uint8Array into a base64url string without padding.
 */
export function base64urlEncode(data: Uint8Array): string {
  return base64urlnopad.encode(data);
}

/**
 * Decodes a base64url string into a Uint8Array.
 */
export function base64urlDecode(str: string): Uint8Array {
  return base64urlnopad.decode(str);
}

/**
 * Encodes a Uint8Array into a base58btc string.
 */
export function base58btcEncode(data: Uint8Array): string {
  return base58.encode(data);
}

/**
 * Decodes a base58btc string into a Uint8Array.
 */
export function base58btcDecode(str: string): Uint8Array {
  return base58.decode(str);
}

/**
 * Converts a UTF-8 string to a Uint8Array.
 */
export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts a Uint8Array to a hex string.
 */
export function bytesToHex(data: Uint8Array): string {
  return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts a hex string to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
