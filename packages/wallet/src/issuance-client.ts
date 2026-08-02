import type {
  CredentialOffer,
  TokenRequest,
  TokenResponse,
  CredentialRequest,
  CredentialResponse,
  VerifiableCredential,
  IssuerMetadata,
} from "@breakchain/core";

import type { KeyStore } from "@breakchain/crypto";
import { WalletCore } from "./wallet-core";

export class IssuanceClient {
  constructor(
    private readonly wallet: WalletCore,
    private readonly keyStore: KeyStore
  ) {}

  /**
   * Process an OpenID4VCI credential offer.
   */
  async processOffer(
    offerUrl: string
  ): Promise<VerifiableCredential> {

    //-------------------------------------
    // STEP 1
    // Parse credential offer URL
    //-------------------------------------

    const url = new URL(offerUrl);

    const encodedOffer = url.searchParams.get("credential_offer");

    if (!encodedOffer) {
      throw new Error("Credential offer missing.");
    }

    const offer: CredentialOffer = JSON.parse(
      decodeURIComponent(encodedOffer)
    );

    //-------------------------------------
    // STEP 2
    // Fetch issuer metadata
    //-------------------------------------

    const metadataResponse = await fetch(
      `${offer.credential_issuer}/.well-known/openid-credential-issuer`
    );

    if (!metadataResponse.ok) {
      throw new Error("Unable to fetch issuer metadata.");
    }

    const metadata: IssuerMetadata =
      await metadataResponse.json();

    //-------------------------------------
    // STEP 3
    // Exchange pre-authorized code
    //-------------------------------------

    const grant =
      offer.grants?.[
        "urn:ietf:params:oauth:grant-type:pre-authorized_code"
      ];

    if (!grant) {
      throw new Error("Pre-authorized grant missing.");
    }

    const tokenRequest: TokenRequest = {
      grant_type:
        "urn:ietf:params:oauth:grant-type:pre-authorized_code",

      pre_authorized_code:
        grant["pre-authorized_code"],
    };

    const tokenResponse = await fetch(
      metadata.token_endpoint!,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(tokenRequest),
      }
    );

    if (!tokenResponse.ok) {
      throw new Error("Token request failed.");
    }

    const token: TokenResponse =
      await tokenResponse.json();

    //-------------------------------------
    // STEP 4
    // Sign c_nonce
    //-------------------------------------

    const holderDid = this.wallet.getDid();

    const nonceBytes = new TextEncoder().encode(
      token.c_nonce ?? ""
    );

    const signature = await this.keyStore.sign(
      holderDid,
      nonceBytes
    );

    const jwt = btoa(
      String.fromCharCode(...signature)
    );

    //-------------------------------------
    // STEP 5
    // Request credential
    //-------------------------------------

    const credentialRequest: CredentialRequest = {
      format: "ldp_vc",

      proof: {
        proof_type: "jwt",

        jwt,
      },
    };

    const credentialResponse = await fetch(
      metadata.credential_endpoint,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token.access_token}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify(
          credentialRequest
        ),
      }
    );

    if (!credentialResponse.ok) {
      throw new Error(
        "Credential issuance failed."
      );
    }

    const result: CredentialResponse =
      await credentialResponse.json();

    //-------------------------------------
    // STEP 6
    // Parse VC
    //-------------------------------------

    const credential: VerifiableCredential =
      JSON.parse(result.credential);

    //-------------------------------------
    // STEP 7
    // Store VC
    //-------------------------------------

    await this.wallet.addCredential(
      credential
    );

    return credential;
  }
}