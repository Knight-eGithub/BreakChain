/**
 * BreakchainSDK — The developer-facing API for the Breakchain ZKP credential ecosystem.
 *
 * Provides 3 primary methods:
 *   1. connectWallet()       — establish a connection to the holder's wallet
 *   2. requestProof(options) — request a ZK proof or presentation from the wallet
 *   3. verifyPresentation(vp)— verify a received VP (signatures + ZK proof + revocation)
 *
 * Plus:
 *   - disconnect()           — tear down the wallet session
 *
 * @example
 * ```typescript
 * import { BreakchainSDK } from '@breakchain/sdk';
 *
 * const sdk = new BreakchainSDK({
 *   walletUrl: 'http://localhost:3002',
 *   issuerUrl: 'http://localhost:3001',
 * });
 *
 * await sdk.connectWallet();
 *
 * const result = await sdk.requestProof({
 *   claims: [{ field: 'age', condition: '>=18' }],
 *   mode: 'zkp',
 * });
 *
 * if (result.verified) {
 *   console.log('Age verified without revealing actual age!');
 * }
 *
 * await sdk.disconnect();
 * ```
 */
import type {
  SDKConfig,
  WalletAdapter,
  WalletSession,
  ClaimRequest,
  ProofResult,
  VerificationResult,
  VerifiablePresentation,
  ProverBackend,
} from '@breakchain/core';
import {
  DEFAULT_SDK_CONFIG,
  WalletConnectionError,
} from '@breakchain/core';
import { HttpWalletAdapter } from './http-wallet-adapter';
import { PresentationRequestBuilder } from './request-builder';
import { VerificationEngine } from './verification-engine';
import type { VerificationEngineOptions } from './verification-engine';
import { generateSalt } from '@breakchain/crypto';

export interface RequestProofOptions {
  /** Claims to verify (e.g. [{ field: 'age', condition: '>=18' }]) */
  claims: ClaimRequest[];
  /** Specific circuit ID override (for ZKP mode) */
  circuit?: string;
  /** Proof mode: 'zkp' (default), 'sd-jwt', or 'plain' */
  mode?: 'zkp' | 'sd-jwt' | 'plain';
  /** Optional name for the proof request */
  name?: string;
  /** Optional purpose description */
  purpose?: string;
}

export class BreakchainSDK {
  private config: SDKConfig;
  private adapter: WalletAdapter;
  private session: WalletSession | null = null;
  private verificationEngine: VerificationEngine;

  /**
   * Creates a new BreakchainSDK instance.
   *
   * @param config SDK configuration
   * @param options Optional overrides for adapter and verification engine
   */
  constructor(
    config?: Partial<SDKConfig>,
    options?: {
      /** Custom wallet adapter. Defaults to HttpWalletAdapter. */
      adapter?: WalletAdapter;
      /** Prover backend for ZK proof verification. */
      proverBackend?: ProverBackend;
      /** Custom fetch function (for testing). */
      fetchFn?: typeof fetch;
    }
  ) {
    this.config = { ...DEFAULT_SDK_CONFIG, ...config } as SDKConfig;

    // Select the appropriate wallet adapter
    if (options?.adapter) {
      this.adapter = options.adapter;
    } else {
      this.adapter = new HttpWalletAdapter(options?.fetchFn);
    }

    // Initialize the verification engine
    const verificationOptions: VerificationEngineOptions = {
      proverBackend: options?.proverBackend,
      issuerUrl: this.config.issuerUrl,
      revocationCheck: this.config.revocationCheck,
      fetchFn: options?.fetchFn,
    };
    this.verificationEngine = new VerificationEngine(verificationOptions);
  }

  /**
   * Connects to the holder's wallet.
   *
   * For the HTTP adapter, this verifies the wallet is reachable and gets its DID.
   * For other adapters, this might open a browser popup, trigger a deep link, etc.
   *
   * @returns The wallet session with the holder's DID
   * @throws {WalletConnectionError} If the wallet is not reachable or not initialized
   * @throws {TimeoutError} If the connection times out
   */
  async connectWallet(): Promise<WalletSession> {
    if (this.session?.connected) {
      return this.session;
    }

    this.session = await this.adapter.connect(this.config);
    return this.session;
  }

  /**
   * Requests a ZK proof or presentation from the connected wallet.
   *
   * This is the primary developer-facing method. It:
   * 1. Builds a PresentationDefinition from the developer's ClaimRequest[]
   * 2. Generates a cryptographic challenge (nonce)
   * 3. Sends the request to the wallet via the adapter
   * 4. Verifies the received presentation
   * 5. Returns a structured ProofResult
   *
   * @param options Proof request options with claims, mode, and optional circuit ID
   * @returns ProofResult with verification status and revealed claims
   *
   * @example
   * ```ts
   * const result = await sdk.requestProof({
   *   claims: [
   *     { field: 'age', condition: '>=18' },
   *     { field: 'nationality', equals: 'US' },
   *   ],
   *   mode: 'zkp',
   * });
   * ```
   */
  async requestProof(options: RequestProofOptions): Promise<ProofResult> {
    // Ensure we're connected
    if (!this.session?.connected) {
      try {
        await this.connectWallet();
      } catch (err) {
        return {
          verified: false,
          error: `Wallet not connected: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    try {
      const mode = options.mode || this.config.defaultProofMode || 'zkp';

      // 1. Build PresentationDefinition from ClaimRequests
      const presentationDef = PresentationRequestBuilder.build(options.claims, {
        name: options.name,
        purpose: options.purpose,
      });

      // 2. Generate a cryptographic challenge (nonce)
      const challenge = generateSalt();

      // 3. Send to wallet via adapter
      const presentation = await (this.adapter as HttpWalletAdapter).sendPresentationRequest(
        this.session!,
        presentationDef,
        challenge,
        {
          mode,
          circuitId: options.circuit,
          claimRequests: options.claims,
        }
      );

      // 4. Verify the response
      const verification = await this.verificationEngine.verify(presentation);

      // 5. Extract revealed claims (for plain/sd-jwt modes)
      const revealedClaims = this.extractRevealedClaims(presentation);

      return {
        verified: verification.valid,
        proofData: this.extractProofData(presentation),
        revealedClaims,
        presentation,
        error: verification.errors.length > 0 ? verification.errors.join('; ') : undefined,
      };
    } catch (err) {
      return {
        verified: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Verifies a Verifiable Presentation independently.
   *
   * Use this when you receive a VP from an external source and want to verify
   * it without going through the requestProof flow.
   *
   * @param presentation The VP to verify
   * @returns Structured VerificationResult
   */
  async verifyPresentation(presentation: VerifiablePresentation): Promise<VerificationResult> {
    return this.verificationEngine.verify(presentation);
  }

  /**
   * Disconnects from the wallet.
   */
  async disconnect(): Promise<void> {
    if (this.session) {
      await this.adapter.disconnect(this.session);
      this.session = null;
    }
  }

  /**
   * Returns whether the SDK is currently connected to a wallet.
   */
  isConnected(): boolean {
    return this.session?.connected ?? false;
  }

  /**
   * Returns the current wallet session, or null if not connected.
   */
  getSession(): WalletSession | null {
    return this.session;
  }

  /**
   * Returns the connected wallet's DID, or null if not connected.
   */
  getWalletDid(): string | null {
    return this.session?.walletDid ?? null;
  }

  /**
   * Extracts revealed claims from a VP's embedded credentials.
   * For plain/sd-jwt modes, the VP contains the full credential subjects.
   */
  private extractRevealedClaims(presentation: VerifiablePresentation): Record<string, unknown> {
    const claims: Record<string, unknown> = {};
    const credentials = presentation.verifiableCredential || [];

    for (const vc of credentials) {
      const subject = vc.credentialSubject;
      if (subject && typeof subject === 'object' && !Array.isArray(subject)) {
        // Merge all credential subject fields into the revealed claims
        for (const [key, value] of Object.entries(subject)) {
          if (key !== 'id') {
            claims[key] = value;
          }
        }
      }
    }

    return claims;
  }

  /**
   * Extracts proof data from a VP's proof field (for ZKP presentations).
   */
  private extractProofData(presentation: VerifiablePresentation): ProofResult['proofData'] {
    const proof = Array.isArray(presentation.proof)
      ? presentation.proof[0]
      : presentation.proof;

    if (!proof?.proofValue) return undefined;

    try {
      const proofObj = typeof proof.proofValue === 'string'
        ? JSON.parse(proof.proofValue)
        : proof.proofValue;

      return {
        proof: proofObj,
        publicSignals: (proof as Record<string, unknown>).publicSignals as string[] || [],
      };
    } catch {
      return undefined;
    }
  }
}
