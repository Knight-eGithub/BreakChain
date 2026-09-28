/**
 * @breakchain/sdk/server — Server-side verification utilities.
 *
 * Use this module in your backend API routes to independently verify
 * Verifiable Presentations received from the client-side SDK.
 *
 * @example
 * ```ts
 * import { verifyPresentation, createServerVerifier } from '@breakchain/sdk/server';
 *
 * // Quick verification
 * const result = await verifyPresentation(vpFromClient);
 *
 * // Or create a reusable verifier with configuration
 * const verifier = createServerVerifier({
 *   revocationCheck: true,
 *   issuerUrl: 'https://issuer.example.com',
 * });
 * const result = await verifier.verify(vpFromClient);
 * ```
 */
import type {
  VerifiablePresentation,
  VerificationResult,
  ProverBackend,
} from '@breakchain/core';
import { VerificationEngine } from './verification-engine';
import type { VerificationEngineOptions } from './verification-engine';

export interface ServerVerifierConfig {
  /** ProverBackend for ZK proof verification. */
  proverBackend?: ProverBackend;
  /** Issuer URL for revocation checks. */
  issuerUrl?: string;
  /** Whether to check revocation status. Default: true for server-side */
  revocationCheck?: boolean;
  /** Custom fetch function (for environments without global fetch). */
  fetchFn?: typeof fetch;
}

/**
 * Creates a reusable server-side verifier instance.
 *
 * Use this when you need to verify multiple presentations with the same
 * configuration (e.g., same issuer URL, same prover backend).
 */
export function createServerVerifier(config?: ServerVerifierConfig): VerificationEngine {
  const options: VerificationEngineOptions = {
    proverBackend: config?.proverBackend,
    issuerUrl: config?.issuerUrl,
    revocationCheck: config?.revocationCheck ?? true,
    fetchFn: config?.fetchFn,
  };
  return new VerificationEngine(options);
}

/**
 * Verifies a Verifiable Presentation server-side.
 *
 * This is a convenience function that creates a one-off verifier.
 * For repeated verification, use `createServerVerifier()` instead.
 *
 * @param presentation The VP to verify (typically received from the client)
 * @param config Optional verification configuration
 * @returns VerificationResult with detailed status
 */
export async function verifyPresentation(
  presentation: VerifiablePresentation,
  config?: ServerVerifierConfig
): Promise<VerificationResult> {
  const engine = createServerVerifier(config);
  return engine.verify(presentation);
}

// Re-export types consumers will need
export type { VerifiablePresentation, VerificationResult, ProverBackend } from '@breakchain/core';
export type { VerificationEngineOptions } from './verification-engine';
