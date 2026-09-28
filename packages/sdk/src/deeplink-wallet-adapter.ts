/**
 * DeepLinkWalletAdapter — Generates OpenID4VP deep link URIs for mobile wallets.
 *
 * This adapter does NOT directly communicate with the wallet. Instead, it:
 * 1. Generates an `openid4vp://` authorization request URI
 * 2. Provides it to the developer's app via a callback (for QR code display or redirect)
 * 3. Waits for the wallet's response to arrive at the developer's `responseUri`
 *
 * The developer must:
 * - Display the URI as a QR code or trigger it as a deep link
 * - Host a `responseUri` endpoint that receives the wallet's VP response
 * - Call the `onResponse` callback when the response arrives
 */
import type {
  WalletAdapter,
  WalletSession,
  SDKConfig,
  PresentationDefinition,
  VerifiablePresentation,
} from '@breakchain/core';
import { WalletConnectionError, WalletDeniedError, TimeoutError } from '@breakchain/core';
import { generateSalt } from '@breakchain/crypto';

export interface DeepLinkCallbacks {
  /** Called with the authorization request URI. Developer should display QR / trigger deep link. */
  onRequestUri: (uri: string) => void;
  /** Developer calls this resolver when the wallet's response arrives at their server. */
  waitForResponse: () => Promise<VerifiablePresentation>;
}

export interface DeepLinkAdapterOptions {
  /** The URL where the mobile wallet should POST the VP response */
  responseUri: string;
  /** Callbacks for the deep link flow */
  callbacks: DeepLinkCallbacks;
}

export class DeepLinkWalletAdapter implements WalletAdapter {
  readonly type = 'deepLink' as const;
  private options: DeepLinkAdapterOptions;

  constructor(options: DeepLinkAdapterOptions) {
    this.options = options;
  }

  /**
   * For deep link flows, "connecting" simply creates a session ID.
   * There is no persistent connection to a mobile wallet.
   */
  async connect(_config: SDKConfig): Promise<WalletSession> {
    return {
      sessionId: generateSalt(),
      connected: true,
      metadata: {
        adapterType: 'deepLink',
        responseUri: this.options.responseUri,
      },
    };
  }

  /**
   * Builds an OpenID4VP authorization request URI and provides it to the developer.
   * Then waits for the developer to relay the wallet's response.
   */
  async sendPresentationRequest(
    session: WalletSession,
    request: PresentationDefinition,
    challenge: string,
  ): Promise<VerifiablePresentation> {
    // Build the OpenID4VP authorization request URI
    const params = new URLSearchParams({
      response_type: 'vp_token',
      response_mode: 'direct_post',
      response_uri: this.options.responseUri,
      nonce: challenge,
      state: session.sessionId,
      presentation_definition: JSON.stringify(request),
    });

    const uri = `openid4vp://authorize?${params.toString()}`;

    // Notify the developer's app with the URI (for QR code display or redirect)
    this.options.callbacks.onRequestUri(uri);

    // Wait for the developer's server to relay the wallet's response
    try {
      const presentation = await this.options.callbacks.waitForResponse();
      return presentation;
    } catch (err) {
      if (err instanceof Error && err.message.includes('timeout')) {
        throw new TimeoutError('Mobile wallet did not respond in time');
      }
      throw new WalletDeniedError(
        `Deep link flow failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * No-op for deep link adapter (no persistent connection).
   */
  async disconnect(_session: WalletSession): Promise<void> {
    // Nothing to disconnect
  }
}
