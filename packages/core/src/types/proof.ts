/**
 * ZKP-related types and abstractions
 */
import { VerifiablePresentation } from './credentials';

export interface ZKProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  publicSignals: string[];
}

export interface CircuitArtifact {
  circuitId: string;
  wasmBuffer?: Uint8Array | ArrayBuffer;
  wasmUrl?: string;
  provingKeyBuffer?: Uint8Array | ArrayBuffer;
  provingKeyUrl?: string;
  verificationKey?: Record<string, unknown>;
}

export interface ProofData {
  proof: Record<string, unknown>;
  publicSignals: string[];
}

/**
 * Backend-agnostic ProverBackend interface
 */
export interface ProverBackend {
  /** Name of the backend (e.g. 'snarkjs-groth16', 'barretenberg-honk') */
  readonly name: string;
  /** Name of the proof system (e.g. 'groth16', 'plonk', 'honk') */
  readonly proofSystem: string;
  
  /** Generate a proof given a circuit and private inputs */
  generateProof(circuit: CircuitArtifact, privateInputs: Record<string, string | bigint | number>): Promise<ProofData>;
  /** Verify a proof given a circuit and proof data */
  verifyProof(circuit: CircuitArtifact, proofData: ProofData): Promise<boolean>;
}

export interface ClaimRequest {
  field: string;
  condition?: string;
  equals?: string | number;
  circuit?: string;
}

export interface ProofResult {
  verified: boolean;
  proofData?: ProofData;
  revealedClaims?: Record<string, unknown>;
  presentation?: VerifiablePresentation;
  error?: string;
}

export interface VerificationResult {
  valid: boolean;
  issuerVerified: boolean;
  holderVerified: boolean;
  proofVerified: boolean;
  revocationChecked: boolean;
  errors: string[];
}
