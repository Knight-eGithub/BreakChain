# Breakchain ZKP SDK

A standards-based Zero-Knowledge Proof credential SDK for verifiable credentials. Built on **W3C VC Data Model v2**, **OpenID4VCI/VP**, **DIF Presentation Exchange**, and **Groth16 ZK proofs** (Circom + snarkjs).

## Architecture

```
Developer Frontend ──→ @breakchain/sdk ───────→ Wallet (Extension / App / HTTP)
                             │                            │
                             │ connectWallet()            │ store VC (Ed25519)
                             │ requestProof()             │ gen Groth16 ZKP
                             │                            │ present VP
                             ▼                            ▼
Developer Backend ───→ @breakchain/sdk/server ──→ Issuer (StatusList2021)
                             │                            │
                             │ verifyPresentation()       │ issue VC (JWS/SD-JWT)
                             │ 5-layer crypto pipeline    │ revoke in registry
                             │
                             ├── @breakchain/core (types, errors, interfaces)
                             ├── @breakchain/crypto (Ed25519, JWS, SHA-256, KeyStore)
                             ├── @breakchain/did (did:key, did:web resolvers)
                             ├── @breakchain/credentials (VC/VP v2, SD-JWT)
                             ├── @breakchain/prover (snarkjs Groth16 prover/verifier)
                             └── @breakchain/circuits (Parameterized Circom ZK circuits)
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/Knight-eGithub/BreakChain.git
cd BreakChain
npm install

# Run all 146 unit & integration tests across 9 packages
npx vitest run

# Build all packages
npm run build --workspaces --if-present
```

## Installation (from npm)

The SDK and core libraries are published to npm under the `@breakchain/` scope:

```bash
npm install @breakchain/sdk
```

---

## SDK Usage

### 1. Client-Side (Frontend Integration)

```typescript
import { BreakchainSDK } from '@breakchain/sdk';

// Initialize SDK with transport adapter ('postMessage' | 'extension' | 'deepLink' | 'http')
const sdk = new BreakchainSDK({
  walletAdapterType: 'postMessage',
});

// Connect to holder's wallet
await sdk.connectWallet();

// Request a Zero-Knowledge Proof — prove age >= 21 without revealing birthdate or age!
const result = await sdk.requestProof({
  claims: [{ field: 'age', condition: '>=21' }],
  mode: 'zkp',
});

if (result.verified) {
  // Send presentation to your backend API to grant session
  await fetch('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ presentation: result.presentation }),
  });
}

await sdk.disconnect();
```

### 2. Server-Side Verification (Next.js / Node.js Backend API Route)

Never trust the frontend alone. Import `@breakchain/sdk/server` in your server API route to independently verify presentations:

```typescript
// In your Next.js route: src/app/api/verify/route.ts
import { NextResponse } from 'next/server';
import { verifyPresentation } from '@breakchain/sdk/server';

export async function POST(req: Request) {
  const { presentation } = await req.json();

  // Executes the 5-layer cryptographic verification pipeline:
  // 1. Schema check | 2. Issuer Ed25519 sig | 3. Condition proof | 4. Holder key binding | 5. StatusList revocation
  const check = await verifyPresentation(presentation, {
    revocationCheck: true,
  });

  if (!check.valid) {
    return NextResponse.json({ error: 'Access Denied: ' + check.errors.join('; ') }, { status: 401 });
  }

  // Grant session — 0 bytes of sensitive documents stored in database!
  return NextResponse.json({ accessGranted: true, sessionToken: 'bk_live_sess_9921' });
}
```

---

## 5-Layer Cryptographic Verification Pipeline

Breakchain protects both user privacy and verifier security via a 5-layer verification pipeline:

```
[Layer 1: Schema Attribute Check]   ──> Does credential contain required claim ('age')?
[Layer 2: Issuer Authority Sig]     ──> Validates Ed25519 signature of issuer DID (did:key / did:web)
[Layer 3: Condition Proof]          ──> Evaluates mathematical condition via Groth16 ZKP or SD-JWT
[Layer 4: Holder Key Binding]       ──> Proves presenter holds private key (blocks stolen token attacks)
[Layer 5: Revocation Status]        ──> Real-time query against issuer's live StatusList2021 registry
```

---

## Multiple Wallet Transport Adapters

The SDK includes 3 production-grade wallet adapters:

| Adapter | Transport | Best For |
|---------|-----------|----------|
| **`PostMessageWalletAdapter`** | `window.postMessage` | Chrome/Brave browser extensions, embedded iframes, in-page wallets |
| **`DeepLinkWalletAdapter`** | `openid4vp://` URIs | Mobile wallets (iOS/Android) via deep links and desktop QR codes |
| **`HttpWalletAdapter`** | HTTP POST / SSE | Standalone desktop wallets and local development servers |

---

## Packages

| Package | Version | Description | Tests |
|---------|---------|-------------|-------|
| [`@breakchain/core`](packages/core) | `0.1.0` | Shared types, errors, constants (W3C VC, DID, ZKP, OpenID4VCI) | Core types |
| [`@breakchain/crypto`](packages/crypto) | `0.1.0` | Ed25519 keys, JWS, SHA-256, multibase, PKCE, KeyStore | ✅ 10 tests |
| [`@breakchain/did`](packages/did) | `0.1.0` | `did:key` + `did:web` resolution, unified DIDResolver | ✅ 18 tests |
| [`@breakchain/credentials`](packages/credentials) | `0.1.0` | VC/VP creation, Ed25519 signing, verification + SD-JWT | ✅ 25 tests |
| [`@breakchain/prover`](packages/prover) | `0.1.0` | snarkjs Groth16 wrapper + MockProverBackend + witness gen | ✅ 16 tests |
| [`@breakchain/circuits`](packages/circuits) | `0.1.0` | Parameterized Circom ZK circuits (dynamic `ageThreshold`) | ✅ 10 tests |
| [`@breakchain/issuer`](packages/issuer) | `0.1.0` | Reference OpenID4VCI issuer server (Express + SQLite) | ✅ 16 tests |
| [`@breakchain/wallet`](packages/wallet) | `0.1.0` | Reference wallet (identity, issuance client, presentation engine) | ✅ 26 tests |
| [`@breakchain/sdk`](packages/sdk) | `0.1.0` | Developer SDK (3-method API + 3 Wallet Adapters + Server Verifier) | ✅ 25 tests |

---

## ZK Circuits (Parameterized)

Circom circuits compiled to WASM with Groth16 trusted setup on `bn128`:

| Circuit | Purpose | Public Inputs | Private Inputs |
|---------|---------|---------------|----------------|
| `age_over` | Proves `age >= ageThreshold` dynamically | `ageHash`, `ageThreshold` | `age`, `salt` |
| `nationality_check` | Proves nationality matches a code (e.g. 356) | `nationalityHash`, `expectedNationality` | `nationality`, `salt` |
| `credential_ownership` | Proves holder controls the private key | `ownershipCommitment` | `holderSecret`, `credentialHash` |

### Building Circuits (requires Circom CLI)

```bash
cd packages/circuits
node scripts/build-circuits.mjs
```

Pre-built artifacts (`.wasm`, `.zkey`, `verification_key.json`) are committed to `packages/circuits/build/`.

---

## Interactive Showcase Demo

A full-stack reference integration built with **Next.js (App Router)** and **React 19** is available in [`breakchain-showcase`](https://github.com/Knight-eGithub/BreakChain):
* **3 Consumer Apps**: 21+ Esports Tournament, National Citizen Subsidy Portal, TechCareers B.Tech Degree Verification.
* **3-Tier Credential Categorization**: Has Criteria & Meets Condition, Has Criteria & Fails Condition, Missing Criteria (Incompatible Schema).
* **Live Server API**: Real Ed25519 cryptographic signing and verification via `/api/verify`, `/api/issue`, and `/api/revoke`.

---

## Standards Compliance

- **W3C Verifiable Credentials Data Model v2** — credential & presentation structure
- **W3C Decentralized Identifiers (DID)** — `did:key` and `did:web` methods
- **OpenID for Verifiable Credential Issuance (OID4VCI)** — issuer protocol
- **DIF Presentation Exchange v2** — presentation request format
- **IETF SD-JWT** — selective disclosure via salted SHA-256 hash claims
- **Groth16** — zero-knowledge proof system (bn128 curve)
- **W3C StatusList2021** — real-time cryptographic revocation registry

---

## License

MIT
