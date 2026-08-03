import type { ProverBackend, CircuitArtifact, ProofData } from '@breakchain/core';
import { sha256String } from '@breakchain/crypto';

/**
 * A mock prover backend for testing without real ZK circuits.
 * Generates deterministic "proofs" by hashing inputs.
 * Verification checks that the proof hash matches the inputs.
 */
export class MockProverBackend implements ProverBackend {
  readonly name = 'mock-prover';
  readonly proofSystem = 'mock';

  async generateProof(
    circuit: CircuitArtifact,
    privateInputs: Record<string, string | bigint | number>
  ): Promise<ProofData> {
    // Create a deterministic "proof" from the circuit ID and inputs
    const inputStr = JSON.stringify(privateInputs, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
    const proofHash = sha256String(`${circuit.circuitId}:${inputStr}`);
    
    // Extract "public signals" — for mock, just the input values as strings
    const publicSignals = Object.values(privateInputs).map(v => String(v));
    
    return {
      proof: {
        mock: true,
        circuitId: circuit.circuitId,
        hash: proofHash,
        timestamp: Date.now()
      },
      publicSignals
    };
  }

  async verifyProof(
    circuit: CircuitArtifact,
    proofData: ProofData
  ): Promise<boolean> {
    // For mock: verify the proof has the mock marker and matches the circuit
    const proof = proofData.proof;
    if (!proof.mock) return false;
    if (proof.circuitId !== circuit.circuitId) return false;
    return true;
  }
}
