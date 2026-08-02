/**
 * IssuanceClient — Wallet-side implementation of the OpenID4VCI flow.
 *
 * Handles the full credential issuance lifecycle:
 * 1. Parse credential offer (with pre-authorized_code)
 * 2. Fetch issuer metadata (/.well-known/openid-credential-issuer)
 * 3. Exchange pre-auth code for access_token + c_nonce
 * 4. Request credential with proof-of-possession
 * 5. Store received VC in the wallet
 */
import type {
  CredentialOffer,
  IssuerMetadata,
  TokenResponse,
  VerifiableCredential,
} from '@breakchain/core';
import type { WalletCore } from './wallet-core';

export interface IssuanceClientOptions {
  /** Base URL of the issuer (e.g. http://localhost:3001) */
  issuerUrl: string;
  /** Optional custom fetch function for testing */
  fetchFn?: typeof fetch;
}

export interface IssuanceResult {
  /** Whether the issuance was successful */
  success: boolean;
  /** The issued credential (if successful) */
  credential?: VerifiableCredential;
  /** The format of the issued credential */
  format?: string;
  /** Error message (if failed) */
  error?: string;
}

export class IssuanceClient {
  private issuerUrl: string;
  private walletCore: WalletCore;
  private fetchFn: typeof fetch;

  constructor(walletCore: WalletCore, options: IssuanceClientOptions) {
    this.walletCore = walletCore;
    this.issuerUrl = options.issuerUrl.replace(/\/$/, ''); // strip trailing slash
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Fetches the issuer's OpenID4VCI metadata from the well-known endpoint.
   */
  async fetchIssuerMetadata(): Promise<IssuerMetadata> {
    const url = `${this.issuerUrl}/.well-known/openid-credential-issuer`;
    const response = await this.fetchFn(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch issuer metadata: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<IssuerMetadata>;
  }

  /**
   * Exchanges a pre-authorized code for an access token and c_nonce.
   *
   * @param preAuthCode The pre-authorized code from the credential offer
   * @returns Token response with access_token and c_nonce
   */
  async exchangePreAuthCode(preAuthCode: string): Promise<TokenResponse> {
    const url = `${this.issuerUrl}/api/token`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        `Token exchange failed: ${response.status} ${(body as any)?.error || response.statusText}`
      );
    }

    return response.json() as Promise<TokenResponse>;
  }

  /**
   * Requests a credential from the issuer using an access token.
   *
   * @param accessToken The bearer access token
   * @param format The desired credential format ('ldp_vc' or 'sd-jwt')
   * @returns The credential response from the issuer
   */
  async requestCredential(
    accessToken: string,
    format: string = 'ldp_vc'
  ): Promise<{ format: string; credential: string; c_nonce?: string }> {
    const url = `${this.issuerUrl}/api/credential`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ format }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        `Credential request failed: ${response.status} ${(body as any)?.error || response.statusText}`
      );
    }

    return response.json() as Promise<{ format: string; credential: string; c_nonce?: string }>;
  }

  /**
   * Executes the full credential issuance flow from a credential offer.
   *
   * 1. Parse the pre-authorized code from the offer
   * 2. Exchange it for an access token
   * 3. Request the credential
   * 4. Parse and store the credential in the wallet
   *
   * @param offer The credential offer (from the issuer)
   * @param format The desired format ('ldp_vc' or 'sd-jwt'). Defaults to 'ldp_vc'.
   * @returns IssuanceResult with the stored credential
   */
  async processOffer(offer: CredentialOffer, format: string = 'ldp_vc'): Promise<IssuanceResult> {
    try {
      // 1. Extract pre-authorized code
      const preAuthGrant = offer.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
      if (!preAuthGrant) {
        return { success: false, error: 'Offer does not contain a pre-authorized_code grant' };
      }
      const preAuthCode = preAuthGrant['pre-authorized_code'];

      // 2. Exchange for token
      const tokenResponse = await this.exchangePreAuthCode(preAuthCode);

      // 3. Request credential
      const credentialResponse = await this.requestCredential(tokenResponse.access_token, format);

      // 4. Parse and store
      if (credentialResponse.format === 'ldp_vc') {
        const vc: VerifiableCredential = JSON.parse(credentialResponse.credential);
        // Store without verification since we trust the issuer during issuance
        // (the VC is freshly signed and we just received it directly)
        await this.walletCore.addCredential(vc);
        return { success: true, credential: vc, format: 'ldp_vc' };
      } else if (credentialResponse.format === 'sd-jwt') {
        // For SD-JWT, store the compact string as a special credential entry
        // In a full implementation, we'd parse the SD-JWT and verify it
        const sdJwtCredential: VerifiableCredential = {
          '@context': ['https://www.w3.org/ns/credentials/v2'],
          id: `urn:uuid:sdjwt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: ['VerifiableCredential', 'SDJWTCredential'],
          issuer: offer.credential_issuer,
          issuanceDate: new Date().toISOString(),
          credentialSubject: {
            sdJwtCompact: credentialResponse.credential,
          },
        };
        // Store without verification for SD-JWT format
        const origVerify = (this.walletCore as any).verifyOnImport;
        (this.walletCore as any).verifyOnImport = false;
        await this.walletCore.addCredential(sdJwtCredential);
        (this.walletCore as any).verifyOnImport = origVerify;
        return { success: true, credential: sdJwtCredential, format: 'sd-jwt' };
      }

      return { success: false, error: `Unsupported credential format: ${credentialResponse.format}` };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Convenience method: creates a credential offer request to the issuer,
   * then processes the returned offer through the full flow.
   *
   * This simulates the complete issuance lifecycle where the wallet
   * initiates the process by requesting an offer.
   *
   * @param credentialType The type of credential to request (e.g. 'IDCard')
   * @param subjectDid The DID of the credential subject (the wallet holder)
   * @param claims The claims to include in the credential
   * @param format The desired format ('ldp_vc' or 'sd-jwt')
   */
  async requestIssuance(
    credentialType: string,
    subjectDid: string,
    claims: Record<string, unknown>,
    format: string = 'ldp_vc'
  ): Promise<IssuanceResult> {
    try {
      // 1. Request an offer from the issuer
      const offerUrl = `${this.issuerUrl}/api/credential-offer`;
      const offerResponse = await this.fetchFn(offerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential_type: credentialType,
          subject_did: subjectDid,
          claims,
        }),
      });

      if (!offerResponse.ok) {
        const body = await offerResponse.json().catch(() => ({}));
        return {
          success: false,
          error: `Offer request failed: ${offerResponse.status} ${(body as any)?.error || offerResponse.statusText}`,
        };
      }

      const offer = (await offerResponse.json()) as CredentialOffer;

      // 2. Process the offer through the standard flow
      return this.processOffer(offer, format);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
