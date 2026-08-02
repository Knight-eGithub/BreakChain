# Breakchain ZKP SDK

A standards-based Zero-Knowledge Proof credential SDK for verifiable credentials. Built on **W3C VC Data Model v2**, **OpenID4VCI/VP**, **DIF Presentation Exchange**, and **Groth16 ZK proofs** (Circom + snarkjs).

## Architecture

```
Developer App ──→ @breakchain/sdk ──→ Wallet ──→ Issuer
                    │                    │          │
                    │ connectWallet()    │ store VC │ issue VC
                    │ requestProof()     │ gen ZKP  │ sign VC
                    │ verifyPresentation │ present  │ revoke
                    │                    │          │
                    ├── @breakchain/core (types, errors)
                    ├── @breakchain/crypto (Ed25519, JWS, hashing)
                    ├── @breakchain/did (did:key, did:web resolution)
                    ├── @breakchain/credentials (VC/VP, SD-JWT)
                    ├── @breakchain/prover (snarkjs Groth16 wrapper)
                    └── @breakchain/circuits (Circom ZK circuits)
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/Knight-eGithub/BreakChain.git
cd BreakChain
npm install

# Run all tests (139 tests)
npx vitest run

# Build all packages
npm run build --workspaces --if-present
```

## SDK Usage

```typescript
import { BreakchainSDK } from '@breakchain/sdk';

const sdk = new BreakchainSDK({
  walletUrl: 'http://localhost:3002',
  issuerUrl: 'http://localhost:3001',
});

// Connect to holder's wallet
await sdk.connectWallet();

// Request a ZK proof — age verified without revealing actual age!
const result = await sdk.requestProof({
  claims: [{ field: 'age', condition: '>=18' }],
  mode: 'zkp',
});

if (result.verified) {
  console.log('✅ Age verified via zero-knowledge proof');
}

await sdk.disconnect();
```

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@breakchain/core`](packages/core) | Shared types, errors, constants (W3C VC, DID, ZKP, OpenID4VCI) | ✅ |
| [`@breakchain/crypto`](packages/crypto) | Ed25519 keys, JWS, SHA-256, multibase, PKCE, KeyStore | ✅ 10 tests |
| [`@breakchain/did`](packages/did) | `did:key` + `did:web` resolution, DIDResolver interface | ✅ 18 tests |
| [`@breakchain/credentials`](packages/credentials) | VC/VP creation, signing, verification + SD-JWT | ✅ 25 tests |
| [`@breakchain/issuer`](packages/issuer) | Reference OpenID4VCI issuer server (Express + SQLite) | ✅ 16 tests |
| [`@breakchain/prover`](packages/prover) | snarkjs Groth16 wrapper + MockProverBackend | ✅ 16 tests |
| [`@breakchain/circuits`](packages/circuits) | Circom ZK circuits (age_over, nationality_check, credential_ownership) | ✅ 10 tests |
| [`@breakchain/wallet`](packages/wallet) | Reference wallet (identity, issuance client, presentation engine) | ✅ 26 tests |
| [`@breakchain/sdk`](packages/sdk) | Developer-facing 3-method API (connectWallet, requestProof, verifyPresentation) | ✅ 18 tests |

## ZK Circuits

Three Circom circuits compiled to WASM with Groth16 trusted setup:

| Circuit | Purpose | Public Inputs | Private Inputs |
|---------|---------|---------------|----------------|
| `age_over` | Proves age ≥ 18 without revealing age | `ageHash` | `age`, `salt` |
| `nationality_check` | Proves nationality matches a value | `nationalityHash`, `expectedNationality` | `nationality`, `salt` |
| `credential_ownership` | Proves holder owns a credential | `ownershipCommitment` | `holderSecret`, `credentialHash` |

### Building Circuits (requires Circom CLI)

```bash
cd packages/circuits
node scripts/build-circuits.mjs
```

Pre-built artifacts (`.wasm`, `.zkey`, `verification_key.json`) are committed to `packages/circuits/build/`.

## End-to-End Flow

```
1. Issuer signs a VC (IDCard) ──→ Wallet stores it
2. Verifier App calls sdk.requestProof({ claims: [{ field: 'age', condition: '>=18' }] })
3. SDK builds PresentationDefinition ──→ sends to Wallet
4. Wallet selects matching credential ──→ generates Groth16 ZK proof
5. Wallet returns VP with ZK proof (no raw age revealed)
6. SDK verifies: holder DID ✓ | ZK proof ✓ | issuer signature ✓ | revocation ✓
7. Verifier App gets ProofResult { verified: true }
```

## Standards Compliance

- **W3C Verifiable Credentials Data Model v2** — credential structure
- **W3C Decentralized Identifiers (DID)** — `did:key` and `did:web` methods
- **OpenID for Verifiable Credential Issuance (OID4VCI)** — issuer protocol
- **DIF Presentation Exchange v2** — presentation request format
- **SD-JWT** — selective disclosure via salted hash claims
- **Groth16** — zero-knowledge proof system (bn128 curve)

## Tech Stack

- **TypeScript** — strict mode, all packages
- **npm workspaces** — monorepo management
- **Vitest** — testing framework
- **tsup** — ESM + CJS + DTS bundling
- **Ed25519** — digital signatures (via `@noble/curves`)
- **Circom 2.x** — ZK circuit language
- **snarkjs** — Groth16 prover/verifier (WASM)
- **Express** — issuer + wallet HTTP servers
- **SQLite** — issuer credential storage (via `better-sqlite3`)

## Project Structure

```
sdk-zkp/
├── packages/
│   ├── core/           → shared types, errors, constants
│   ├── crypto/         → Ed25519, JWS, hashing, KeyStore
│   ├── did/            → did:key + did:web resolvers
│   ├── credentials/    → VC/VP engine + SD-JWT
│   ├── circuits/       → Circom circuits + build artifacts
│   ├── prover/         → snarkjs Groth16 wrapper
│   ├── issuer/         → reference OpenID4VCI issuer
│   ├── wallet/         → reference holder wallet
│   └── sdk/            → developer-facing SDK
├── docs/               → architecture documents
├── package.json        → workspace root
└── tsconfig.base.json  → shared TypeScript config
```

## License

MIT
