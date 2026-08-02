/**
 * HttpWalletAdapter — Communicates with a wallet via HTTP REST.
 *
 * This is the reference adapter for the demo ecosystem, talking to the
 * reference wallet server at http://localhost:3002.
 *
 * Other adapters (postMessage, browser extension, deep link) can be
 * implemented by conforming to the same WalletAdapter interface from @breakchain/core.
 */
import type {
  WalletAdapter,
  WalletSession,
  SDKConfig,
  PresentationDefinition,
  VerifiablePresentation,
  VerifiableCredential,
  CredentialOffer,
  ClaimRequest,
} from '@breakchain/core';
import { WalletConnectionError, WalletDeniedError, TimeoutError } from '@breakchain/core';
import { generateSalt } from '@breakchain/crypto';

/** Extended request body sent to the wallet's /api/presentation-request endpoint */
export interface WalletPresentationRequestBody {
  presentationDefinition: PresentationDefinition;
  challenge: string;
  mode?: 'zkp' | 'sd-jwt' | 'plain';
  circuitId?: string;
  claimRequests?: Array<{ field: string; condition?: string; value?: unknown }>;
}

/** Response from the wallet's /api/presentation-request endpoint */
interface WalletPresentationResponseBody {
  success: boolean;
  presentation?: VerifiablePresentation;
  proofType?: string;
  zkProof?: Record<string, unknown>;
  error?: string;
}

export class HttpWalletAdapter implements WalletAdapter {
  readonly type = 'http' as const;
  private fetchFn: typeof fetch;

  constructor(fetchFn?: typeof fetch) {
    this.fetchFn = fetchFn || globalThis.fetch;
  }

  /**
   * Connects to the wallet by verifying it's reachable and getting its DID.
   */
  async connect(config: SDKConfig): Promise<WalletSession> {
    const walletUrl = config.walletUrl || 'http://localhost:3002';
    const timeout = config.timeout || 30000;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await this.fetchFn(`${walletUrl}/api/identity`, {
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new WalletConnectionError(
          `Wallet responded with status ${response.status}`,
          { walletUrl, status: response.status }
        );
      }

      const identity = await response.json() as {
        did: string | null;
        credentialCount: number;
        initialized: boolean;
      };

      if (!identity.initialized || !identity.did) {
        throw new WalletConnectionError(
          'Wallet is not initialized',
          { walletUrl }
        );
      }

      return {
        sessionId: generateSalt(),
        walletDid: identity.did,
        connected: true,
        metadata: {
          walletUrl,
          credentialCount: identity.credentialCount,
        },
      };
    } catch (err) {
      if (err instanceof WalletConnectionError) throw err;

      if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError(`Wallet connection timed out after ${timeout}ms`, { walletUrl });
      }

      throw new WalletConnectionError(
        `Failed to connect to wallet: ${err instanceof Error ? err.message : String(err)}`,
        { walletUrl }
      );
    }
  }

  /**
   * Sends a presentation request to the wallet and returns the VP.
   *
   * @param session Active wallet session
   * @param request PresentationDefinition with input_descriptors
   * @param challenge Nonce for replay protection
   * @param options Additional options (mode, circuitId, claimRequests)
   */
  async sendPresentationRequest(
    session: WalletSession,
    request: PresentationDefinition,
    challenge: string,
    options?: {
      mode?: 'zkp' | 'sd-jwt' | 'plain';
      circuitId?: string;
      claimRequests?: ClaimRequest[];
    }
  ): Promise<VerifiablePresentation> {
    const walletUrl = (session.metadata?.walletUrl as string) || 'http://localhost:3002';

    const body: WalletPresentationRequestBody = {
      presentationDefinition: request,
      challenge,
      mode: options?.mode,
      circuitId: options?.circuitId,
      claimRequests: options?.claimRequests?.map(cr => ({
        field: cr.field,
        condition: cr.condition,
        value: cr.equals,
      })),
    };

    const response = await this.fetchFn(`${walletUrl}/api/presentation-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      if (response.status === 400 && errBody.error?.includes('No matching credentials')) {
        throw new WalletDeniedError(`Wallet has no matching credentials: ${errBody.error}`);
      }
      throw new WalletConnectionError(
        `Wallet presentation request failed: ${response.status} ${errBody.error || ''}`,
        { status: response.status }
      );
    }

    const result = await response.json() as WalletPresentationResponseBody;

    if (!result.success || !result.presentation) {
      throw new WalletDeniedError(result.error || 'Wallet did not return a presentation');
    }

    return result.presentation;
  }

  /**
   * Requests credential issuance through the wallet.
   *
   * @param session Active wallet session
   * @param offer CredentialOffer to process
   */
  async requestCredentialIssuance(
    session: WalletSession,
    offer: CredentialOffer
  ): Promise<VerifiableCredential> {
    const walletUrl = (session.metadata?.walletUrl as string) || 'http://localhost:3002';

    const response = await this.fetchFn(`${walletUrl}/api/receive-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new WalletConnectionError(
        `Credential issuance failed: ${response.status} ${errBody.error || ''}`,
        { status: response.status }
      );
    }

    const result = await response.json() as { success: boolean; credentialId?: string; error?: string };

    if (!result.success) {
      throw new WalletConnectionError(result.error || 'Issuance failed');
    }

    // The wallet stores the credential internally; return a minimal VC reference
    // In a real implementation we'd get the full VC back
    return {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: result.credentialId || 'unknown',
      type: ['VerifiableCredential'],
      issuer: offer.credential_issuer,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {},
    };
  }

  /**
   * Disconnects from the wallet (no-op for HTTP adapter).
   */
  async disconnect(_session: WalletSession): Promise<void> {
    // HTTP is stateless — nothing to disconnect
  }
}
