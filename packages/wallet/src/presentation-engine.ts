/**
 * PresentationEngine — Handles presentation requests from verifiers.
 *
 * Supports three modes:
 * 1. **ZKP mode**: Extract private inputs from credentials, select circuit,
 *    generate ZK proof via @breakchain/prover
 * 2. **SD-JWT mode**: Create selective disclosure presentation
 * 3. **Plain VP mode**: Create and sign a Verifiable Presentation with holder key
 */
import type {
  VerifiableCredential,
  VerifiablePresentation,
  PresentationDefinition,
  CredentialProof,
  ProverBackend,
  ProofData,
} from '@breakchain/core';
import type { WalletCore } from './wallet-core';
import { createPresentation, signPresentation } from '@breakchain/credentials';

export type PresentationMode = 'zkp' | 'sd-jwt' | 'plain';

export interface PresentationRequest {
  /** The DIF Presentation Exchange definition */
  presentationDefinition: PresentationDefinition;
  /** Challenge/nonce for replay protection */
  challenge: string;
  /** Which proof mode to use. Defaults to 'plain'. */
  mode?: PresentationMode;
  /** For ZKP mode: specific circuit ID to use */
  circuitId?: string;
  /** For ZKP mode: claim conditions (e.g. { field: 'age', condition: '>=18' }) */
  claimRequests?: Array<{ field: string; condition?: string; value?: unknown }>;
}

export interface PresentationResponse {
  /** Whether the presentation was successfully created */
  success: boolean;
  /** The Verifiable Presentation (for plain/zkp modes) */
  presentation?: VerifiablePresentation;
  /** The proof type used */
  proofType?: PresentationMode;
  /** ZKP proof data (for zkp mode) */
  zkProof?: ProofData;
  /** Error message if failed */
  error?: string;
}

export class PresentationEngine {
  private walletCore: WalletCore;
  private proverBackend: ProverBackend | null = null;

  constructor(walletCore: WalletCore, proverBackend?: ProverBackend) {
    this.walletCore = walletCore;
    this.proverBackend = proverBackend || null;
  }

  /**
   * Sets the prover backend for ZKP mode.
   */
  setProverBackend(backend: ProverBackend): void {
    this.proverBackend = backend;
  }

  /**
   * Processes a presentation request and returns a VP response.
   *
   * @param request The presentation request from a verifier
   * @returns PresentationResponse with the VP or error
   */
  async processRequest(request: PresentationRequest): Promise<PresentationResponse> {
    const mode = request.mode || 'plain';

    try {
      // 1. Find matching credentials
      const matchedCredentials = await this.walletCore.findCredentials(
        request.presentationDefinition.input_descriptors
      );

      if (matchedCredentials.length === 0) {
        return {
          success: false,
          error: 'No matching credentials found for the presentation request',
        };
      }

      // 2. Dispatch to the appropriate mode handler
      switch (mode) {
        case 'zkp':
          return this.handleZKPPresentation(matchedCredentials, request);
        case 'sd-jwt':
          return this.handleSDJWTPresentation(matchedCredentials, request);
        case 'plain':
        default:
          return this.handlePlainPresentation(matchedCredentials, request);
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Plain VP mode: Create a standard Verifiable Presentation signed with the holder's key.
   */
  private async handlePlainPresentation(
    credentials: VerifiableCredential[],
    request: PresentationRequest
  ): Promise<PresentationResponse> {
    const holderDid = this.walletCore.getDid();
    const keyStore = this.walletCore.getKeyStore();

    // Create unsigned VP
    const vp = createPresentation({
      credentials,
      holder: holderDid,
    });

    // Sign the VP using the keystore
    // We need to create the signed VP manually since signPresentation needs a raw key
    const verificationMethod = `${holderDid}#${holderDid.split(':').pop()}`;

    // Build the JWS signing input
    const { proof, ...vpWithoutProof } = vp;
    const headerB64 = base64urlEncode(JSON.stringify({ alg: 'EdDSA' }));
    const payloadB64 = base64urlEncode(JSON.stringify(vpWithoutProof));
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = await keyStore.sign(holderDid, signingInput);
    const sigB64 = base64urlEncodeBytes(signature);
    const jws = `${headerB64}.${payloadB64}.${sigB64}`;

    const signedVp: VerifiablePresentation = {
      ...vpWithoutProof,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod,
        proofPurpose: 'authentication',
        challenge: request.challenge,
        jws,
      },
    };

    return {
      success: true,
      presentation: signedVp,
      proofType: 'plain',
    };
  }

  /**
   * ZKP mode: Extract credential claims, select circuit, generate ZK proof,
   * and wrap in a Verifiable Presentation.
   */
  private async handleZKPPresentation(
    credentials: VerifiableCredential[],
    request: PresentationRequest
  ): Promise<PresentationResponse> {
    if (!this.proverBackend) {
      return {
        success: false,
        error: 'No prover backend configured for ZKP mode. Call setProverBackend() first.',
      };
    }

    if (!request.claimRequests || request.claimRequests.length === 0) {
      return {
        success: false,
        error: 'ZKP mode requires claimRequests specifying which claims to prove',
      };
    }

    // Use the first matching credential
    const credential = credentials[0];
    const subject = credential.credentialSubject as Record<string, unknown>;

    // Build private inputs from credential claims
    const privateInputs: Record<string, string | bigint | number> = {};
    for (const claimReq of request.claimRequests) {
      const value = subject[claimReq.field];
      if (value !== undefined) {
        if (typeof value === 'number' || typeof value === 'bigint') {
          privateInputs[claimReq.field] = value;
        } else if (typeof value === 'string') {
          // Try to parse as number, otherwise hash the string
          const numVal = Number(value);
          if (!isNaN(numVal)) {
            privateInputs[claimReq.field] = numVal;
          } else {
            // Encode string as bigint for circuit input
            privateInputs[claimReq.field] = stringToBigInt(value);
          }
        }
      }
    }

    // Add a salt for commitment
    privateInputs.salt = BigInt(Math.floor(Math.random() * 2 ** 32));

    // Generate ZK proof
    const circuitId = request.circuitId || 'age_over';
    const proofData = await this.proverBackend.generateProof(
      { circuitId },
      privateInputs
    );

    // Create a VP that embeds the ZK proof
    const holderDid = this.walletCore.getDid();
    const verificationMethod = `${holderDid}#${holderDid.split(':').pop()}`;

    const signedVp: VerifiablePresentation = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiablePresentation', 'ZKProofPresentation'],
      holder: holderDid,
      // Don't include the full credential — ZKP means we don't reveal it
      verifiableCredential: [],
      proof: {
        type: 'ZKProof',
        created: new Date().toISOString(),
        verificationMethod,
        proofPurpose: 'authentication',
        challenge: request.challenge,
        proofValue: JSON.stringify(proofData.proof),
        // Include public signals and circuit ID as custom proof fields
        circuitId,
        publicSignals: proofData.publicSignals,
      } as CredentialProof & { circuitId: string; publicSignals: string[] },
    };

    return {
      success: true,
      presentation: signedVp,
      proofType: 'zkp',
      zkProof: proofData,
    };
  }

  /**
   * SD-JWT mode: Create a selective disclosure presentation from SD-JWT credentials.
   */
  private async handleSDJWTPresentation(
    credentials: VerifiableCredential[],
    request: PresentationRequest
  ): Promise<PresentationResponse> {
    // Find SD-JWT credentials
    const sdJwtCreds = credentials.filter(c =>
      c.type.includes('SDJWTCredential') &&
      (c.credentialSubject as Record<string, unknown>)?.sdJwtCompact
    );

    if (sdJwtCreds.length === 0) {
      // Fall back to plain VP if no SD-JWT credentials found
      return this.handlePlainPresentation(credentials, request);
    }

    const holderDid = this.walletCore.getDid();
    const verificationMethod = `${holderDid}#${holderDid.split(':').pop()}`;

    // For SD-JWT, the VP contains the SD-JWT compact string
    // In a full implementation, we'd selectively disclose only requested fields
    const sdJwtCompact = (sdJwtCreds[0].credentialSubject as Record<string, unknown>).sdJwtCompact as string;

    const signedVp: VerifiablePresentation = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiablePresentation', 'SDJWTPresentation'],
      holder: holderDid,
      verifiableCredential: sdJwtCreds,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod,
        proofPurpose: 'authentication',
        challenge: request.challenge,
        // Include the SD-JWT compact string in the proof for convenience
        proofValue: sdJwtCompact,
      },
    };

    return {
      success: true,
      presentation: signedVp,
      proofType: 'sd-jwt',
    };
  }
}

/** Encode a string as a BigInt (using UTF-8 byte values) */
function stringToBigInt(str: string): bigint {
  const bytes = new TextEncoder().encode(str);
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/** Base64url encode a string (UTF-8) */
function base64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return base64urlEncodeBytes(bytes);
}

/** Base64url encode bytes */
function base64urlEncodeBytes(data: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64url');
  }
  const binString = Array.from(data, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
