import { createJWS, verifyJWS, decodeJWS, sha256Hash, base64urlEncode, base64urlDecode, utf8ToBytes, generateSalt } from '@breakchain/crypto';

export interface SDJWTPayload {
  iss: string;
  sub?: string;
  iat: number;
  exp?: number;
  _sd: string[];
  _sd_alg: string;
  [key: string]: unknown;
}

export interface Disclosure {
  salt: string;
  claimName: string;
  claimValue: unknown;
  encoded: string;
}

export interface SDJWTIssueResult {
  compact: string;
  disclosures: Disclosure[];
  jwt: string;
}

export interface SDJWTVerifyResult {
  valid: boolean;
  issuerVerified: boolean;
  disclosedClaims: Record<string, unknown>;
  allClaimsValid: boolean;
  errors: string[];
}

/**
 * Creates a disclosure for a claim.
 * @param claimName The name of the claim
 * @param claimValue The value of the claim
 * @returns A disclosure containing salt, name, value, and encoded string
 */
export function createDisclosure(claimName: string, claimValue: unknown): Disclosure {
  const salt = generateSalt();
  const arr = [salt, claimName, claimValue];
  const encoded = base64urlEncode(utf8ToBytes(JSON.stringify(arr)));
  return { salt, claimName, claimValue, encoded };
}

/**
 * Hashes an encoded disclosure string.
 * @param encodedDisclosure The base64url encoded disclosure
 * @returns Base64url hash of the disclosure
 */
export function hashDisclosure(encodedDisclosure: string): string {
  return base64urlEncode(sha256Hash(utf8ToBytes(encodedDisclosure)));
}

/**
 * Issues an SD-JWT with selective disclosures.
 * @param options SD-JWT issuing options
 * @returns Result object containing the compact string and disclosures
 */
export function issueSDJWT(options: {
  issuer: string;
  subject?: string;
  claims: Record<string, unknown>;
  disclosureFrame: string[];
  privateKey: Uint8Array;
  expiresIn?: number;
}): SDJWTIssueResult {
  const payload: SDJWTPayload = {
    iss: options.issuer,
    iat: Math.floor(Date.now() / 1000),
    _sd: [],
    _sd_alg: 'sha-256'
  };

  if (options.subject) {
    payload.sub = options.subject;
  }
  if (options.expiresIn) {
    payload.exp = payload.iat + options.expiresIn;
  }

  const disclosures: Disclosure[] = [];

  for (const [key, value] of Object.entries(options.claims)) {
    if (options.disclosureFrame.includes(key)) {
      const disclosure = createDisclosure(key, value);
      disclosures.push(disclosure);
      payload._sd.push(hashDisclosure(disclosure.encoded));
    } else {
      payload[key] = value;
    }
  }

  payload._sd.sort();

  const jwt = createJWS(payload as unknown as Record<string, unknown>, options.privateKey);
  const compact = `${jwt}~${disclosures.map(d => d.encoded).join('~')}~`;

  return { compact, disclosures, jwt };
}

/**
 * Derives a presentation SD-JWT by revealing only specified claims.
 * @param compact Original compact SD-JWT
 * @param revealFields List of claim names to reveal
 * @returns Derived compact SD-JWT string for presentation
 */
export function presentSDJWT(compact: string, revealFields: string[]): string {
  const parts = compact.split('~');
  const jwt = parts[0];
  const disclosureParts = parts.slice(1, parts.length - 1);
  
  const selected: string[] = [];
  
  for (const disc of disclosureParts) {
    try {
      const decodedStr = new TextDecoder().decode(base64urlDecode(disc));
      const parsed = JSON.parse(decodedStr);
      if (Array.isArray(parsed) && parsed.length === 3) {
        const claimName = parsed[1];
        if (revealFields.includes(claimName)) {
          selected.push(disc);
        }
      }
    } catch (e) {
      // Ignore parse errors on individual disclosures
    }
  }
  
  return `${jwt}~${selected.join('~')}~`;
}

/**
 * Verifies an SD-JWT presentation.
 * @param compact The presented SD-JWT compact string
 * @param publicKey The issuer's public key
 * @returns Verification result with disclosed claims
 */
export function verifySDJWT(compact: string, publicKey: Uint8Array): SDJWTVerifyResult {
  const parts = compact.split('~');
  const jwt = parts[0];
  const disclosureParts = parts.slice(1, parts.length - 1);
  
  const result: SDJWTVerifyResult = {
    valid: false,
    issuerVerified: false,
    disclosedClaims: {},
    allClaimsValid: true,
    errors: []
  };

  const jwsResult = verifyJWS(jwt, publicKey);
  if (!jwsResult.valid) {
    result.errors.push('JWT signature verification failed');
    return result;
  }

  result.issuerVerified = true;
  const payload = jwsResult.payload as SDJWTPayload;
  const sdHashes = new Set(payload._sd || []);
  
  for (const [k, v] of Object.entries(payload)) {
    if (!['iss', 'sub', 'iat', 'exp', '_sd', '_sd_alg'].includes(k)) {
      result.disclosedClaims[k] = v;
    }
  }

  for (const disc of disclosureParts) {
    if (!disc) continue;
    try {
      const hash = hashDisclosure(disc);
      if (!sdHashes.has(hash)) {
        result.allClaimsValid = false;
        result.errors.push('Disclosure hash not found in JWT');
        continue;
      }
      
      const decodedStr = new TextDecoder().decode(base64urlDecode(disc));
      const parsed = JSON.parse(decodedStr);
      if (Array.isArray(parsed) && parsed.length === 3) {
        const claimName = parsed[1];
        const claimValue = parsed[2];
        result.disclosedClaims[claimName] = claimValue;
      } else {
        result.allClaimsValid = false;
        result.errors.push('Invalid disclosure format');
      }
    } catch (e) {
      result.allClaimsValid = false;
      result.errors.push('Failed to parse disclosure');
    }
  }

  result.valid = result.issuerVerified && result.allClaimsValid;
  return result;
}
