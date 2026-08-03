import type { ProverBackend, CircuitArtifact, ProofData } from '@breakchain/core';

export class SnarkjsProverBackend implements ProverBackend {
  readonly name = 'snarkjs-groth16';
  readonly proofSystem = 'groth16';

  async generateProof(
    circuit: CircuitArtifact,
    privateInputs: Record<string, string | bigint | number>
  ): Promise<ProofData> {
    // Dynamically import snarkjs (it's a CommonJS module)
    const snarkjs = await import('snarkjs');
    
    // Resolve WASM: prefer buffer, fall back to URL
    const wasm = circuit.wasmBuffer || circuit.wasmUrl;
    if (!wasm) throw new Error('Circuit WASM not provided (wasmBuffer or wasmUrl)');
    
    // Resolve proving key: prefer buffer, fall back to URL
    const zkey = circuit.provingKeyBuffer || circuit.provingKeyUrl;
    if (!zkey) throw new Error('Proving key not provided (provingKeyBuffer or provingKeyUrl)');
    
    // Convert inputs: snarkjs expects string or bigint values
    const inputs: Record<string, any> = {};
    for (const [key, value] of Object.entries(privateInputs)) {
      inputs[key] = typeof value === 'number' ? BigInt(value) : value;
    }
    
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasm, zkey);
    
    return {
      proof: proof as Record<string, unknown>,
      publicSignals
    };
  }

  async verifyProof(
    circuit: CircuitArtifact,
    proofData: ProofData
  ): Promise<boolean> {
    const snarkjs = await import('snarkjs');
    
    if (!circuit.verificationKey) {
      throw new Error('Verification key not provided in circuit artifact');
    }
    
    return snarkjs.groth16.verify(
      circuit.verificationKey,
      proofData.publicSignals,
      proofData.proof
    );
  }
}
