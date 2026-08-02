/**
 * VerificationEngine — Multi-layer verification of Verifiable Presentations.
 *
 * Verification layers:
 * 1. Holder's VP signature (resolve DID, verify EdDSA JWS)
 * 2. Each embedded VC's issuer signature (resolve DID, verify EdDSA JWS)
 * 3. ZK proof verification (if present, via ProverBackend)
 * 4. Revocation status check (if configured, via issuer API)
 */
import type {
  VerifiablePresentation,
  VerifiableCredential,
  VerificationResult,
  ProverBackend,
  ProofData,
  SDKConfig,
} from '@breakchain/core';
import { verifyPresentation as verifyVP } from '@breakchain/credentials';
import { createResolver } from '@breakchain/did';
import type { DIDResolver } from '@breakchain/did';

export interface VerificationEngineOptions {
  /** DID resolver instance. If not provided, uses the default resolver. */
  resolver?: DIDResolver;
  /** ProverBackend for ZK proof verification. Optional. */
  proverBackend?: ProverBackend;
  /** Issuer URL for revocation checks. */
  issuerUrl?: string;
  /** Whether to check revocation status. Default: false */
  revocationCheck?: boolean;
  /** Custom fetch function for revocation checks (testing). */
  fetchFn?: typeof fetch;
}

export class VerificationEngine {
  private resolver: DIDResolver;
  private proverBackend: ProverBackend | null;
  private issuerUrl: string | null;
  private revocationCheck: boolean;
  private fetchFn: typeof fetch;

  constructor(options?: VerificationEngineOptions) {
    this.resolver = options?.resolver || createResolver();
    this.proverBackend = options?.proverBackend || null;
    this.issuerUrl = options?.issuerUrl || null;
    this.revocationCheck = options?.revocationCheck ?? false;
    this.fetchFn = options?.fetchFn || globalThis.fetch;
  }

  /**
   * Performs full verification of a Verifiable Presentation.
   *
   * Steps:
   * 1. If it's a ZKProofPresentation, verify the ZK proof
   * 2. If it has a standard EdDSA proof, verify holder + issuer signatures
   * 3. If revocation checking is enabled, check each VC's revocation status
   *
   * @param presentation The VP to verify
   * @returns Structured VerificationResult
   */
  async verify(presentation: VerifiablePresentation): Promise<VerificationResult> {
    const result: VerificationResult = {
      valid: false,
      issuerVerified: false,
      holderVerified: false,
      proofVerified: false,
      revocationChecked: false,
      errors: [],
    };

    try {
      // Check if this is a ZKP presentation
      const isZkp = presentation.type?.includes('ZKProofPresentation');

      if (isZkp) {
        // ZKP verification path
        await this.verifyZKPresentation(presentation, result);
      } else {
        // Standard VP verification path (holder + issuer signatures)
        await this.verifyStandardPresentation(presentation, result);
      }

      // Revocation check (for standard presentations with embedded VCs)
      if (this.revocationCheck && this.issuerUrl) {
        await this.checkRevocation(presentation, result);
      }

      // Final result
      result.valid = result.proofVerified && (result.errors.length === 0);
    } catch (err) {
      result.errors.push(
        `Verification error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return result;
  }

  /**
   * Verifies a standard VP (Ed25519 holder signature + embedded VC issuer signatures).
   * Delegates to @breakchain/credentials' verifyPresentation function.
   */
  private async verifyStandardPresentation(
    presentation: VerifiablePresentation,
    result: VerificationResult
  ): Promise<void> {
    const vpResult = await verifyVP(presentation, this.resolver);

    result.holderVerified = vpResult.holderVerified;
    result.issuerVerified = vpResult.issuerVerified;
    result.proofVerified = vpResult.proofVerified;

    if (!vpResult.valid) {
      result.errors.push(...vpResult.errors);
    }
  }

  /**
   * Verifies a ZK proof presentation.
   *
   * For ZKP presentations, the VP doesn't embed the raw credential.
   * Instead, the proof field contains the ZK proof data. We verify:
   * 1. The ZK proof itself (via ProverBackend)
   * 2. The holder DID is valid (resolve did:key)
   */
  private async verifyZKPresentation(
    presentation: VerifiablePresentation,
    result: VerificationResult
  ): Promise<void> {
    const proof = Array.isArray(presentation.proof)
      ? presentation.proof[0]
      : presentation.proof;

    if (!proof) {
      result.errors.push('ZKP presentation has no proof');
      return;
    }

    // 1. Verify the holder DID is resolvable
    const holderDid = presentation.holder || proof.verificationMethod?.split('#')[0];
    if (holderDid) {
      try {
        await this.resolver.resolve(holderDid);
        result.holderVerified = true;
      } catch (err) {
        result.errors.push(
          `Failed to resolve holder DID "${holderDid}": ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }
    }

    // 2. Verify the ZK proof
    if (!this.proverBackend) {
      // Without a prover backend, we can't verify ZK proofs — mark as unverified
      // but don't fail (the caller should check proofVerified)
      result.errors.push('No prover backend available for ZK proof verification');
      return;
    }

    const circuitId = (proof as Record<string, unknown>).circuitId as string;
    const publicSignals = (proof as Record<string, unknown>).publicSignals as string[];
    const proofValue = proof.proofValue;

    if (!circuitId || !proofValue) {
      result.errors.push('ZKP presentation missing circuitId or proofValue');
      return;
    }

    let proofObj: Record<string, unknown>;
    try {
      proofObj = typeof proofValue === 'string' ? JSON.parse(proofValue) : proofValue;
    } catch {
      result.errors.push('Failed to parse ZK proof value');
      return;
    }

    const proofData: ProofData = {
      proof: proofObj,
      publicSignals: publicSignals || [],
    };

    const isValid = await this.proverBackend.verifyProof(
      { circuitId },
      proofData
    );

    result.proofVerified = isValid;
    // For ZKP, issuer verification is implicit (the proof attests to the credential)
    result.issuerVerified = isValid;

    if (!isValid) {
      result.errors.push('ZK proof verification failed');
    }
  }

  /**
   * Checks revocation status for each VC in the presentation.
   */
  private async checkRevocation(
    presentation: VerifiablePresentation,
    result: VerificationResult
  ): Promise<void> {
    const credentials = presentation.verifiableCredential || [];

    for (const vc of credentials) {
      if (!vc.id) continue;

      try {
        const statusUrl = `${this.issuerUrl}/api/credentials/${encodeURIComponent(vc.id)}/status`;
        const response = await this.fetchFn(statusUrl);

        if (response.ok) {
          const status = await response.json() as { revoked: boolean; reason?: string };
          if (status.revoked) {
            result.errors.push(
              `Credential ${vc.id} has been revoked${status.reason ? `: ${status.reason}` : ''}`
            );
            result.valid = false;
          }
        }
        // If the status endpoint isn't available, we skip silently
      } catch {
        // Revocation check is best-effort; network errors don't fail verification
      }
    }

    result.revocationChecked = true;
  }
}
