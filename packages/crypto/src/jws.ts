import { base64urlEncode, base64urlDecode, utf8ToBytes } from './encoding';
import { sign, verify } from './signing';
import { Ed25519JWK } from './jwk';

export type JWSHeader = {
  alg: 'EdDSA';
  typ?: string;
  kid?: string;
  jwk?: Ed25519JWK;
  [key: string]: unknown;
};

/**
 * Creates a compact JWS.
 */
export function createJWS(payload: Record<string, unknown>, privateKey: Uint8Array, header?: Partial<JWSHeader>): string {
  const jwsHeader: JWSHeader = { alg: 'EdDSA', ...header };
  const headerStr = base64urlEncode(utf8ToBytes(JSON.stringify(jwsHeader)));
  const payloadStr = base64urlEncode(utf8ToBytes(JSON.stringify(payload)));
  
  const signingInput = `${headerStr}.${payloadStr}`;
  const signatureBytes = sign(privateKey, utf8ToBytes(signingInput));
  const signatureStr = base64urlEncode(signatureBytes);
  
  return `${signingInput}.${signatureStr}`;
}

/**
 * Verifies a compact JWS.
 */
export function verifyJWS(jws: string, publicKey: Uint8Array): { valid: boolean; header: JWSHeader; payload: Record<string, unknown> } {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }
  
  const [headerStr, payloadStr, signatureStr] = parts;
  const signingInput = `${headerStr}.${payloadStr}`;
  const signatureBytes = base64urlDecode(signatureStr);
  
  const valid = verify(publicKey, utf8ToBytes(signingInput), signatureBytes);
  
  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerStr))) as JWSHeader;
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadStr))) as Record<string, unknown>;
  
  return { valid, header, payload };
}

/**
 * Decodes a JWS without verification.
 */
export function decodeJWS(jws: string): { header: JWSHeader; payload: Record<string, unknown>; signature: Uint8Array } {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }
  
  const [headerStr, payloadStr, signatureStr] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerStr))) as JWSHeader;
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadStr))) as Record<string, unknown>;
  const signature = base64urlDecode(signatureStr);
  
  return { header, payload, signature };
}
