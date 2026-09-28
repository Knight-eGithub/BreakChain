/**
 * Real ZKP End-to-End Test — Uses actual compiled circuits with snarkjs.
 *
 * This test generates and verifies REAL Groth16 proofs using the compiled
 * circuit WASM files, proving keys (.zkey), and verification keys.
 *
 * Covers:
 * 1. age_over: prove age >= 18 without revealing actual age
 * 2. nationality_check: prove nationality matches a value without revealing other fields
 * 3. credential_ownership: prove holder owns a credential without revealing the secret
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// @ts-ignore - snarkjs doesn't have proper types
import * as snarkjs from 'snarkjs';
// @ts-ignore - circomlibjs for Poseidon hash
import { buildPoseidon } from 'circomlibjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, '..', '..', 'build');

function loadVKey(name: string) {
  return JSON.parse(readFileSync(join(BUILD_DIR, `${name}_vkey.json`), 'utf-8'));
}

function wasmPath(name: string) {
  return join(BUILD_DIR, `${name}_js`, `${name}.wasm`);
}

function zkeyPath(name: string) {
  return join(BUILD_DIR, `${name}.zkey`);
}

describe('Real ZKP Proofs (Groth16 + snarkjs)', () => {
  let poseidon: any;
  let F: any; // Finite field utility

  // Build Poseidon once (it's async)
  it('initializes Poseidon hash', async () => {
    poseidon = await buildPoseidon();
    F = poseidon.F;
    expect(poseidon).toBeDefined();
  });

  describe('age_over circuit', () => {
    it('proves age >= 18 (age = 25) — should PASS', async () => {
      const age = 25;
      const salt = 12345n;

      // Compute Poseidon hash commitment: Poseidon(age, salt)
      const hash = poseidon([age, salt]);
      const ageHash = F.toObject(hash);

      const input = {
        age: age,
        salt: salt.toString(),
        ageHash: ageHash.toString(),
        ageThreshold: 18,
      };

      // Generate proof
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmPath('age_over'),
        zkeyPath('age_over')
      );

      expect(proof).toBeDefined();
      expect(proof.pi_a).toBeDefined();
      expect(publicSignals).toBeDefined();

      // Verify proof
      const vkey = loadVKey('age_over');
      const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      expect(verified).toBe(true);
    });

    it('proves age >= 18 (age = 18, boundary) — should PASS', async () => {
      const age = 18;
      const salt = 99999n;
      const hash = poseidon([age, salt]);
      const ageHash = F.toObject(hash);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        { age, salt: salt.toString(), ageHash: ageHash.toString(), ageThreshold: 18 },
        wasmPath('age_over'),
        zkeyPath('age_over')
      );

      const vkey = loadVKey('age_over');
      const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      expect(verified).toBe(true);
    });

    it('rejects age < 18 (age = 16) — should FAIL at witness generation', async () => {
      const age = 16;
      const salt = 42n;
      const hash = poseidon([age, salt]);
      const ageHash = F.toObject(hash);

      // This should fail during witness generation because the constraint
      // `gte.out === 1` will not be satisfied
      await expect(
        snarkjs.groth16.fullProve(
          { age, salt: salt.toString(), ageHash: ageHash.toString(), ageThreshold: 18 },
          wasmPath('age_over'),
          zkeyPath('age_over')
        )
      ).rejects.toThrow();
    });

    it('rejects wrong hash commitment — should FAIL at witness generation', async () => {
      const age = 25;
      const salt = 100n;
      const wrongHash = '999999999'; // doesn't match Poseidon(25, 100)

      await expect(
        snarkjs.groth16.fullProve(
          { age, salt: salt.toString(), ageHash: wrongHash, ageThreshold: 18 },
          wasmPath('age_over'),
          zkeyPath('age_over')
        )
      ).rejects.toThrow();
    });

    it('proves age >= 21 with custom threshold — should PASS', async () => {
      const age = 25;
      const salt = 12345n;
      const hash = poseidon([age, salt]);
      const ageHash = F.toObject(hash);

      const input = {
        age: age,
        salt: salt.toString(),
        ageHash: ageHash.toString(),
        ageThreshold: 21,
      };

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmPath('age_over'),
        zkeyPath('age_over')
      );

      expect(proof).toBeDefined();
      const vkey = loadVKey('age_over');
      const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      expect(verified).toBe(true);
    });

    it('rejects age < 21 with threshold 21 — should FAIL at witness generation', async () => {
      const age = 20;
      const salt = 99999n;
      const hash = poseidon([age, salt]);
      const ageHash = F.toObject(hash);

      const input = {
        age: age,
        salt: salt.toString(),
        ageHash: ageHash.toString(),
        ageThreshold: 21,
      };

      await expect(
        snarkjs.groth16.fullProve(input, wasmPath('age_over'), zkeyPath('age_over'))
      ).rejects.toThrow();
    });
  });

  describe('nationality_check circuit', () => {
    it('proves nationality matches expected value — should PASS', async () => {
      const nationality = 840n; // US country code
      const expectedNationality = 840n;
      const salt = 77777n;

      const hash = poseidon([nationality, salt]);
      const nationalityHash = F.toObject(hash);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        {
          nationality: nationality.toString(),
          salt: salt.toString(),
          nationalityHash: nationalityHash.toString(),
          expectedNationality: expectedNationality.toString(),
        },
        wasmPath('nationality_check'),
        zkeyPath('nationality_check')
      );

      const vkey = loadVKey('nationality_check');
      const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      expect(verified).toBe(true);
    });

    it('rejects wrong nationality — should FAIL at witness generation', async () => {
      const nationality = 840n; // US
      const expectedNationality = 276n; // Germany — mismatch!
      const salt = 77777n;

      const hash = poseidon([nationality, salt]);
      const nationalityHash = F.toObject(hash);

      await expect(
        snarkjs.groth16.fullProve(
          {
            nationality: nationality.toString(),
            salt: salt.toString(),
            nationalityHash: nationalityHash.toString(),
            expectedNationality: expectedNationality.toString(),
          },
          wasmPath('nationality_check'),
          zkeyPath('nationality_check')
        )
      ).rejects.toThrow();
    });
  });

  describe('credential_ownership circuit', () => {
    it('proves credential ownership with correct secret — should PASS', async () => {
      const holderSecret = 123456789n;
      const credentialHash = 987654321n;

      const hash = poseidon([holderSecret, credentialHash]);
      const ownershipCommitment = F.toObject(hash);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        {
          holderSecret: holderSecret.toString(),
          credentialHash: credentialHash.toString(),
          ownershipCommitment: ownershipCommitment.toString(),
        },
        wasmPath('credential_ownership'),
        zkeyPath('credential_ownership')
      );

      const vkey = loadVKey('credential_ownership');
      const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      expect(verified).toBe(true);
    });

    it('rejects wrong secret — should FAIL at witness generation', async () => {
      const holderSecret = 123456789n;
      const credentialHash = 987654321n;

      // Compute correct commitment but try with wrong secret
      const hash = poseidon([holderSecret, credentialHash]);
      const ownershipCommitment = F.toObject(hash);

      const wrongSecret = 111111111n;

      await expect(
        snarkjs.groth16.fullProve(
          {
            holderSecret: wrongSecret.toString(),
            credentialHash: credentialHash.toString(),
            ownershipCommitment: ownershipCommitment.toString(),
          },
          wasmPath('credential_ownership'),
          zkeyPath('credential_ownership')
        )
      ).rejects.toThrow();
    });
  });

  describe('proof tamper detection', () => {
    it('rejects a tampered proof', async () => {
      const age = 25;
      const salt = 55555n;
      const hash = poseidon([age, salt]);
      const ageHash = F.toObject(hash);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        { age, salt: salt.toString(), ageHash: ageHash.toString(), ageThreshold: 18 },
        wasmPath('age_over'),
        zkeyPath('age_over')
      );

      // Tamper with the proof
      const tamperedProof = JSON.parse(JSON.stringify(proof));
      tamperedProof.pi_a[0] = '1234567890';

      const vkey = loadVKey('age_over');
      const verified = await snarkjs.groth16.verify(vkey, publicSignals, tamperedProof);
      expect(verified).toBe(false);
    });
  });
});
