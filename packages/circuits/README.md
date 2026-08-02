# @breakchain/circuits

Circom ZK circuit definitions for the Breakchain ZKP SDK. Includes pre-compiled WASM witness calculators, Groth16 proving keys, and verification keys.

## Circuits

| Circuit | Constraints | Public Inputs | Private Inputs |
|---------|-------------|---------------|----------------|
| `age_over` | 252 non-linear | `ageHash` | `age`, `salt` |
| `nationality_check` | 244 non-linear | `nationalityHash`, `expectedNationality` | `nationality`, `salt` |
| `credential_ownership` | 243 non-linear | `ownershipCommitment` | `holderSecret`, `credentialHash` |

All circuits use **Poseidon hash** for commitments (from `circomlib`) and produce **Groth16 proofs** on the **bn128** curve.

## Pre-built Artifacts

The `build/` directory contains all compiled artifacts — consumers don't need Circom installed:

```
build/
├── age_over.r1cs                    # constraint system
├── age_over.zkey                    # Groth16 proving key (254 KB)
├── age_over_vkey.json               # verification key
├── age_over_js/age_over.wasm        # WASM witness calculator (1.7 MB)
├── nationality_check.r1cs
├── nationality_check.zkey
├── nationality_check_vkey.json
├── nationality_check_js/nationality_check.wasm
├── credential_ownership.r1cs
├── credential_ownership.zkey
├── credential_ownership_vkey.json
├── credential_ownership_js/credential_ownership.wasm
└── pot12.ptau                       # Powers of Tau (shared, 4.6 MB)
```

## Building from Source

Requires [Circom CLI](https://docs.circom.io/getting-started/installation/) (Rust):

```bash
# Install Circom
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom

# Build circuits (compile + trusted setup)
cd packages/circuits
node scripts/build-circuits.mjs
```

## Usage with snarkjs

```typescript
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

// 1. Compute Poseidon commitment
const poseidon = await buildPoseidon();
const F = poseidon.F;
const hash = poseidon([age, salt]);
const ageHash = F.toObject(hash).toString();

// 2. Generate proof
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  { age: 25, salt: '12345', ageHash },
  'build/age_over_js/age_over.wasm',
  'build/age_over.zkey'
);

// 3. Verify proof
const vkey = JSON.parse(fs.readFileSync('build/age_over_vkey.json', 'utf-8'));
const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
// verified === true (age 25 >= 18, commitment valid)
```

## Trusted Setup

The proving keys were generated using a single-party "demo" trusted setup:
1. Powers of Tau ceremony (2^12 = 4096 constraints)
2. Groth16 phase 2 per circuit
3. Single random contribution

> ⚠️ For production use, a multi-party trusted setup ceremony is required.

## Tests

```bash
npx vitest run packages/circuits
```

10 tests covering real Groth16 proof generation/verification for all 3 circuits, including boundary conditions and tamper detection.
