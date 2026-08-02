import type {
  VerifiableCredential,
  VerifiablePresentation,
  PresentationDefinition,
} from "@breakchain/core";

import type { KeyStore } from "@breakchain/crypto";

export type PresentationMode = "plain" | "sd-jwt" | "zkp";

export interface PresentationResult {
  vp_token: VerifiablePresentation | unknown;
  proof_type: string;
}

export class PresentationEngine {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly holderDid: string
  ) {}

  async createPresentation(
    credentials: VerifiableCredential[],
    definition: PresentationDefinition,
    challenge: string,
    mode: PresentationMode
  ): Promise<PresentationResult> {

    switch (mode) {

      case "plain":
        return this.createPlainPresentation(
          credentials,
          challenge
        );

      case "sd-jwt":
        return this.createSDJWTPresentation(
          credentials,
          challenge
        );

      case "zkp":
        return this.createZKPresentation(
          credentials,
          definition,
          challenge
        );

      default:
        throw new Error("Unsupported presentation mode.");
    }
  }

  /**
   * Plain Verifiable Presentation
   */
  private async createPlainPresentation(
    credentials: VerifiableCredential[],
    challenge: string
  ): Promise<PresentationResult> {

    const proofBytes = await this.keyStore.sign(
      this.holderDid,
      new TextEncoder().encode(challenge)
    );

    const proof = {
      type: "Ed25519Signature2020",
      created: new Date().toISOString(),
      verificationMethod: this.holderDid,
      proofPurpose: "authentication",
      challenge,
      proofValue: this.toBase64(proofBytes),
    };

    const vp: VerifiablePresentation = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
      ],

      type: [
        "VerifiablePresentation",
      ],

      holder: this.holderDid,

      verifiableCredential: credentials,

      proof,
    };

    return {
      vp_token: vp,
      proof_type: "plain",
    };
  }

  /**
   * Placeholder SD-JWT presentation.
   * Replace once SD-JWT package is ready.
   */
  private async createSDJWTPresentation(
    credentials: VerifiableCredential[],
    challenge: string
  ): Promise<PresentationResult> {

    return {
      vp_token: {
        mode: "sd-jwt",
        challenge,
        credentials,
      },

      proof_type: "sd-jwt",
    };
  }

  /**
   * Placeholder ZKP presentation.
   * Replace with actual prover later.
   */
  private async createZKPresentation(
    credentials: VerifiableCredential[],
    definition: PresentationDefinition,
    challenge: string
  ): Promise<PresentationResult> {

    return {

      vp_token: {

        proof: {
          pi_a: ["mock"],
          pi_b: [["mock"]],
          pi_c: ["mock"],
        },

        publicSignals: ["1"],

        credentials,

        presentationDefinition: definition,

        challenge,
      },

      proof_type: "zkp",
    };
  }

  /**
   * Convert bytes into Base64.
   */
 private toBase64(bytes: Uint8Array): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}
}