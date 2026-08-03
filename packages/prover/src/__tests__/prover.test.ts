import { describe, it, expect } from 'vitest';
import { MockProverBackend } from '../mock-backend';
import { SnarkjsProverBackend } from '../snarkjs-backend';
import { CircuitSelector } from '../circuit-selector';
import { WitnessGenerator } from '../witness-generator';
import type { CircuitArtifact, ProverBackend } from '@breakchain/core';

// Test circuit artifact (mock)
const mockArtifact: CircuitArtifact = {
  circuitId: 'age_over',
  verificationKey: { mock: true }
};

describe('MockProverBackend', () => {
  const prover = new MockProverBackend();

  it('implements ProverBackend interface', () => {
    expect(prover.name).toBe('mock-prover');
    expect(prover.proofSystem).toBe('mock');
    // Verify it satisfies the interface
    const backend: ProverBackend = prover;
    expect(backend.generateProof).toBeTypeOf('function');
    expect(backend.verifyProof).toBeTypeOf('function');
  });

  it('generates a proof with correct structure', async () => {
    const result = await prover.generateProof(mockArtifact, {
      age: 25,
      salt: '12345',
      ageHash: '67890'
    });

    expect(result.proof).toBeDefined();
    expect(result.proof.mock).toBe(true);
    expect(result.proof.circuitId).toBe('age_over');
    expect(result.publicSignals).toBeInstanceOf(Array);
    expect(result.publicSignals.length).toBe(3); // 3 inputs
  });

  it('verifies its own proofs', async () => {
    const proofData = await prover.generateProof(mockArtifact, { age: 25 });
    const isValid = await prover.verifyProof(mockArtifact, proofData);
    expect(isValid).toBe(true);
  });

  it('rejects proofs with wrong circuit ID', async () => {
    const proofData = await prover.generateProof(mockArtifact, { age: 25 });
    const wrongArtifact: CircuitArtifact = { ...mockArtifact, circuitId: 'wrong_circuit' };
    const isValid = await prover.verifyProof(wrongArtifact, proofData);
    expect(isValid).toBe(false);
  });

  it('generates different proofs for different inputs', async () => {
    const proof1 = await prover.generateProof(mockArtifact, { age: 25 });
    const proof2 = await prover.generateProof(mockArtifact, { age: 30 });
    expect(proof1.proof.hash).not.toBe(proof2.proof.hash);
  });
});

describe('SnarkjsProverBackend', () => {
  const prover = new SnarkjsProverBackend();

  it('implements ProverBackend interface', () => {
    expect(prover.name).toBe('snarkjs-groth16');
    expect(prover.proofSystem).toBe('groth16');
    const backend: ProverBackend = prover;
    expect(backend.generateProof).toBeTypeOf('function');
    expect(backend.verifyProof).toBeTypeOf('function');
  });

  it('throws when no WASM provided', async () => {
    const artifact: CircuitArtifact = { circuitId: 'test' };
    await expect(prover.generateProof(artifact, { x: 1 })).rejects.toThrow('WASM');
  });

  it('throws when no verification key provided', async () => {
    const artifact: CircuitArtifact = { circuitId: 'test' };
    const proofData = { proof: {}, publicSignals: [] };
    await expect(prover.verifyProof(artifact, proofData)).rejects.toThrow('Verification key');
  });
});

describe('CircuitSelector', () => {
  const selector = new CircuitSelector();

  selector.register({
    circuitId: 'age_over',
    field: 'age',
    condition: '>=',
    artifact: mockArtifact
  });
  selector.register({
    circuitId: 'nationality_check',
    field: 'nationality',
    condition: '==',
    artifact: { circuitId: 'nationality_check' }
  });

  it('selects circuit by field and condition', () => {
    const result = selector.select({ field: 'age', condition: '>=' });
    expect(result).not.toBeNull();
    expect(result!.circuitId).toBe('age_over');
  });

  it('selects circuit by explicit circuit ID', () => {
    const result = selector.select({ field: 'any', circuit: 'nationality_check' });
    expect(result).not.toBeNull();
    expect(result!.circuitId).toBe('nationality_check');
  });

  it('returns null for unregistered circuit', () => {
    const result = selector.select({ field: 'email', condition: '==' });
    expect(result).toBeNull();
  });

  it('lists all registered circuits', () => {
    const circuits = selector.listCircuits();
    expect(circuits).toHaveLength(2);
  });
});

describe('WitnessGenerator', () => {
  const generator = new WitnessGenerator();

  it('generates age-over inputs', () => {
    const witness = generator.generateAgeOverInputs(25, 12345n, 67890n);
    expect(witness.circuitId).toBe('age_over');
    expect(witness.inputs.age).toBe(25n);
    expect(witness.inputs.salt).toBe(12345n);
    expect(witness.inputs.ageHash).toBe(67890n);
  });

  it('generates nationality check inputs', () => {
    const witness = generator.generateNationalityCheckInputs(1n, 999n, 555n, 1n);
    expect(witness.circuitId).toBe('nationality_check');
    expect(witness.inputs.nationality).toBe(1n);
    expect(witness.inputs.expectedNationality).toBe(1n);
  });

  it('generates credential ownership inputs', () => {
    const witness = generator.generateCredentialOwnershipInputs(111n, 222n, 333n);
    expect(witness.circuitId).toBe('credential_ownership');
    expect(witness.inputs.holderSecret).toBe(111n);
  });

  it('encodes string fields to bigint', () => {
    const encoded = generator.encodeStringField('India');
    expect(typeof encoded).toBe('bigint');
    expect(encoded).toBeGreaterThan(0n);
    // Same input should produce same output
    const encoded2 = generator.encodeStringField('India');
    expect(encoded).toBe(encoded2);
    // Different input should produce different output
    const encoded3 = generator.encodeStringField('USA');
    expect(encoded).not.toBe(encoded3);
  });
});
