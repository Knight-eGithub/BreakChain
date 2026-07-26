# Phase B Kickoff — Team Action Plan

> **Date:** July 27, 2026
> **Status:** Foundation (Phases 1-3) is COMPLETE. All 53 tests passing. Ready to parallelize.

---

## Pre-Kickoff Checklist (All Team Members)

Before anyone starts coding:

- [ ] Everyone clones / pulls the latest `main` branch
- [ ] Run `npm install` at root — verify it completes
- [ ] Run these commands to confirm everything builds and passes:

```bash
cd packages/core   && npm run build && cd ../..
cd packages/crypto && npm run build && npm run test && cd ../..
cd packages/did    && npm run build && npm run test && cd ../..
cd packages/credentials && npm run build && npm run test && cd ../..
```

**Expected result:** 53 tests passing (10 crypto + 18 DID + 25 credentials)

- [ ] Each person creates their branch from `main`:
  - ZKP Engineer: `git checkout -b feat/circuits-prover`
  - Backend Engineer: `git checkout -b feat/issuer-server`
  - Wallet Engineer: `git checkout -b feat/wallet-core`
  - Lead: `git checkout -b feat/sdk-core`

---

## Foundation You're Building On

### What's already built and frozen

| Package | Version | Tests | What it provides |
|---|---|---|---|
| `@breakchain/core` | 0.1.0 | N/A (types only) | All TypeScript interfaces, error classes, constants |
| `@breakchain/crypto` | 0.1.0 | 10 passing | Ed25519 keys, sign/verify, SHA-256, JWS, JWK, PKCE, KeyStore |
| `@breakchain/did` | 0.1.0 | 18 passing | did:key generator/resolver, did:web resolver, unified DIDResolver |
| `@breakchain/credentials` | 0.1.0 | 25 passing | VC/VP create/sign/verify (with DID resolver), full SD-JWT flow |

### Frozen API Reference — what you can import

```typescript
// ═══ @breakchain/core ═══
// Types
import type {
  VerifiableCredential, VerifiablePresentation, CredentialProof,
  CredentialSubject, CredentialStatus,
  DIDDocument, VerificationMethod, DIDResolutionResult,
  ZKProof, ProverBackend, CircuitArtifact, ProofResult, VerificationResult,
  CredentialOffer, TokenResponse, PresentationDefinition, InputDescriptor,
  SDKConfig, WalletAdapter, WalletSession, ClaimRequest,
} from '@breakchain/core';

// Errors
import {
  CipheraError, WalletDeniedError, ProofGenerationError,
  InvalidProofError, RevocationError, CredentialNotFoundError,
  ResolverError, UnsupportedMethodError, InvalidCredentialError,
} from '@breakchain/core';

// Constants
import {
  SUPPORTED_ALGORITHMS, CREDENTIAL_FORMATS, DID_METHODS,
  PROOF_PURPOSES, W3C_CREDENTIALS_CONTEXT, W3C_DID_CONTEXT,
  STATUS_LIST_2021_CONTEXT, DEFAULT_SDK_CONFIG,
} from '@breakchain/core';

// ═══ @breakchain/crypto ═══
import {
  generateEd25519KeyPair, getPublicKey,        // Key generation
  sign, verify,                                 // Ed25519 sign/verify
  sha256Hash, sha256Hex, sha256Base64url,       // Hashing
  base64urlEncode, base64urlDecode,             // Encoding
  base58Encode, base58Decode,
  publicKeyToMultibase, multibaseToPublicKey,
  createJWS, verifyJWS, decodeJWS,             // JWS
  publicKeyToJWK, privateKeyToJWK, jwkToPublicKey, jwkToPrivateKey,  // JWK
  generateCodeVerifier, generateCodeChallenge,  // PKCE
  generateSalt, utf8ToBytes,                    // Utilities
  InMemoryKeyStore,                             // KeyStore implementation
} from '@breakchain/crypto';
export type { KeyStore } from '@breakchain/crypto';

// ═══ @breakchain/did ═══
import {
  generateDidKey, didKeyToPublicKey,            // did:key
  resolveDidKey, resolveDidKeyFull,
  didWebToUrl, resolveDidWeb, resolveDidWebFull, // did:web
  createResolver, detectMethod,                 // Unified resolver
  extractPublicKeyFromDoc,
} from '@breakchain/did';
export type { DIDResolver } from '@breakchain/did';

// ═══ @breakchain/credentials ═══
import {
  createCredential, signCredential,             // VC
  verifyCredentialSignature, verifyCredential,   // VC verification (raw + resolver)
  createPresentation, signPresentation,          // VP
  verifyPresentationSignature, verifyPresentation, // VP verification (raw + resolver)
  createDisclosure, hashDisclosure,              // SD-JWT primitives
  issueSDJWT, presentSDJWT, verifySDJWT,         // SD-JWT full flow
} from '@breakchain/credentials';
```

---

## Individual Briefings

Copy-paste the relevant section to each teammate.

---

## 🟢 ZKP Engineer — Your Brief

**Your mission:** Build the ZK proof system. Circom circuits + snarkjs JavaScript wrapper.

**Your packages:** `packages/circuits/` and `packages/prover/`

**Your branch:** `feat/circuits-prover`

### Step 1: Scaffold packages (Day 1 morning)

Create these two packages:

**`packages/circuits/package.json`:**
```json
{
  "name": "@breakchain/circuits",
  "version": "0.1.0",
  "description": "ZKP circuit definitions and pre-built artifacts",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts"
  },
  "dependencies": {
    "@breakchain/core": "0.1.0"
  }
}
```

**`packages/prover/package.json`:**
```json
{
  "name": "@breakchain/prover",
  "version": "0.1.0",
  "description": "ZKP prover and verifier wrapping snarkjs",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "test": "vitest run"
  },
  "dependencies": {
    "@breakchain/core": "0.1.0",
    "@breakchain/circuits": "0.1.0",
    "snarkjs": "^0.7.0",
    "circomlibjs": "^0.1.7"
  },
  "devDependencies": {
    "vitest": "^3.2.7"
  }
}
```

Run `npm install` from root after creating these.

### Step 2: Build circuits (Days 1-4)

You need Circom installed (Rust binary). Build 3 circuits:

| Circuit | Purpose | Private inputs | Public inputs |
|---|---|---|---|
| `ageOver` | Proves `age >= threshold` | `age`, `salt` | `ageHash` (Poseidon), `threshold` |
| `nationalityCheck` | Proves nationality matches | `nationality`, `salt` | `nationalityHash` (Poseidon), `expectedHash` |
| `credentialOwnership` | Proves DID owns credential | `didSecret`, `credentialHash` | `ownershipHash` (Poseidon) |

For each circuit:
1. Write the `.circom` file in `packages/circuits/circom/`
2. Compile: `circom circuit.circom --r1cs --wasm --sym -o artifacts/`
3. Trusted setup: Powers-of-Tau + Groth16 setup → `.zkey` + `verification_key.json`
4. Commit all artifacts to `packages/circuits/artifacts/`

### Step 3: Build prover wrapper (Days 5-7)

```typescript
// packages/prover/src/prover.ts
import * as snarkjs from 'snarkjs';

export class ZKProver {
  constructor(
    private circuitWasm: Uint8Array,
    private zkeyData: Uint8Array
  ) {}

  async generateProof(inputs: Record<string, bigint>): Promise<{
    proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
    publicSignals: string[];
  }> {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs, this.circuitWasm, this.zkeyData
    );
    return { proof, publicSignals };
  }
}

// packages/prover/src/verifier.ts
export class ZKVerifier {
  constructor(private verificationKey: object) {}

  async verify(proof: any, publicSignals: string[]): Promise<boolean> {
    return snarkjs.groth16.verify(this.verificationKey, publicSignals, proof);
  }
}
```

Also build:
- `CircuitSelector` — maps `ClaimRequest` (e.g. `{ field: 'age', condition: '>=18' }`) to circuit name
- `WitnessGenerator` — converts credential claim values to circuit input signals (Poseidon hashing)

### Step 4: Tests (Day 7)

Write tests that prove:
- `age = 25, threshold = 18` → proof verifies ✅
- `age = 16, threshold = 18` → proof fails ❌
- Nationality match → ✅, mismatch → ❌

### What you export (your public API contract)

```typescript
// packages/prover/src/index.ts
export { ZKProver } from './prover';
export { ZKVerifier } from './verifier';
export { CircuitSelector } from './circuit-selector';
export { WitnessGenerator } from './witness-generator';
```

### What you DON'T touch
- Any file in `packages/core/`, `packages/crypto/`, `packages/did/`, `packages/credentials/`
- If you need a new type, message the Lead to add it to `@breakchain/core`

### Your deliverable deadline
**~7 working days.** Merge `feat/circuits-prover` into `main` after Lead reviews.

---

## 🔵 Backend Engineer — Your Brief

**Your mission:** Build the OpenID4VCI-compliant issuer server and revocation system.

**Your packages:** `packages/issuer/` and `packages/revocation/`

**Your branch:** `feat/issuer-server`

### Step 1: Scaffold packages (Day 1 morning)

**`packages/issuer/package.json`:**
```json
{
  "name": "@breakchain/issuer",
  "version": "0.1.0",
  "description": "Reference OpenID4VCI credential issuer server",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "test": "vitest run",
    "start": "tsx src/server.ts"
  },
  "dependencies": {
    "@breakchain/core": "0.1.0",
    "@breakchain/crypto": "0.1.0",
    "@breakchain/did": "0.1.0",
    "@breakchain/credentials": "0.1.0",
    "express": "^4.21.0",
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/cors": "^2.8.0",
    "vitest": "^3.2.7",
    "tsx": "^4.0.0"
  }
}
```

**`packages/revocation/package.json`:**
```json
{
  "name": "@breakchain/revocation",
  "version": "0.1.0",
  "description": "Credential revocation and StatusList2021 support",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "test": "vitest run"
  },
  "dependencies": {
    "@breakchain/core": "0.1.0"
  },
  "devDependencies": {
    "vitest": "^3.2.7"
  }
}
```

### Step 2: Build issuer server (Days 1-5)

Reference: [implementation_plan.md Phase 4](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/docs/implementation_plan.md#L172-L218)

**Endpoints to implement:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/.well-known/openid-credential-issuer` | Issuer metadata (supported types, formats, endpoints) |
| `GET` | `/.well-known/oauth-authorization-server` | OAuth metadata (token endpoint, grant types) |
| `GET` | `/.well-known/did.json` | Issuer's DID Document (did:web) |
| `POST` | `/api/credential-offer` | Create credential offer with pre-authorized code |
| `POST` | `/api/token` | Exchange pre-auth code for `{ access_token, c_nonce }` |
| `POST` | `/api/credential` | Issue signed VC (validate bearer, verify PoP, build + sign VC) |

**Credential issuance flow (what the wallet will call):**
```
1. POST /api/credential-offer  →  { offer_url, pre-authorized_code }
2. POST /api/token { pre-authorized_code }  →  { access_token, c_nonce }
3. POST /api/credential { format, proof: { jwt } }  →  { credential, c_nonce }
      (Bearer: access_token)
```

**SQLite schema:**
```sql
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  holder_did TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'active',  -- 'active' | 'revoked'
  status_index INTEGER,          -- index in StatusList2021 bitstring
  issued_at TEXT NOT NULL
);

CREATE TABLE tokens (
  code TEXT PRIMARY KEY,
  access_token TEXT,
  c_nonce TEXT,
  holder_did TEXT,
  credential_type TEXT,
  created_at TEXT NOT NULL,
  used INTEGER DEFAULT 0
);
```

**Key management on startup:**
```typescript
import { generateEd25519KeyPair } from '@breakchain/crypto';
import { generateDidKey } from '@breakchain/did';

// On server start:
const issuerKeys = generateEd25519KeyPair();
const issuerDid = generateDidKey(issuerKeys.publicKey);
// Serve DID Document at /.well-known/did.json
```

**How to sign credentials (use existing foundation):**
```typescript
import { createCredential, signCredential, issueSDJWT } from '@breakchain/credentials';
import { publicKeyToMultibase } from '@breakchain/crypto';

const vc = createCredential({
  issuer: issuerDid,
  subject: { id: holderDid, name: 'Alice', age: 25 },
  types: ['IDCard'],
});
const verificationMethod = `${issuerDid}#${publicKeyToMultibase(issuerKeys.publicKey)}`;
const signedVC = signCredential(vc, issuerKeys.privateKey, verificationMethod);
```

### Step 3: Build revocation (Days 6-8)

Add to the issuer server:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/status?id=<credentialId>` | Check if credential is revoked |
| `POST` | `/api/revoke` | Mark credential as revoked (issuer-authenticated) |
| `GET` | `/api/status-list` | Serve signed StatusList2021 credential |

Build the client library in `packages/revocation/`:
```typescript
export class RevocationClient {
  constructor(private issuerUrl: string) {}
  
  async checkStatus(credentialId: string): Promise<{ revoked: boolean }> {
    const res = await fetch(`${this.issuerUrl}/api/status?id=${credentialId}`);
    return res.json();
  }
}
```

### Your deliverable deadlines
- **Day 5:** Issuer server running at `:3001`, full offer → token → credential flow works via curl
- **Day 8:** Revocation endpoints + `RevocationClient` exported

### What you DON'T touch
- Any file in `packages/core/`, `packages/crypto/`, `packages/did/`, `packages/credentials/`

---

## 🟡 Wallet Engineer — Your Brief

**Your mission:** Build the holder wallet that stores credentials, talks to the issuer, and generates presentations (including ZK proofs).

**Your packages:** `packages/wallet/` (primary), `packages/demo-app/` (later), plus one file in `packages/crypto/`

**Your branch:** `feat/wallet-core`

### Step 1: Scaffold package (Day 1 morning)

**`packages/wallet/package.json`:**
```json
{
  "name": "@breakchain/wallet",
  "version": "0.1.0",
  "description": "Reference holder wallet with credential storage and presentation engine",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "test": "vitest run",
    "start": "tsx src/server.ts"
  },
  "dependencies": {
    "@breakchain/core": "0.1.0",
    "@breakchain/crypto": "0.1.0",
    "@breakchain/did": "0.1.0",
    "@breakchain/credentials": "0.1.0",
    "express": "^4.21.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.0",
    "vitest": "^3.2.7",
    "tsx": "^4.0.0"
  }
}
```

### Step 2: Wallet Core + Storage (Days 1-4)

```typescript
// packages/wallet/src/wallet-core.ts
import type { KeyStore } from '@breakchain/crypto';
import type { VerifiableCredential, InputDescriptor, PresentationDefinition, VerifiablePresentation } from '@breakchain/core';

export class WalletCore {
  private did: string | null = null;

  constructor(private keyStore: KeyStore) {}

  async initialize(): Promise<string> { /* generate DID, return did:key */ }
  getDid(): string { /* return current DID */ }
  async addCredential(vc: VerifiableCredential): Promise<void> { /* verify issuer sig, then store */ }
  async getCredentials(): Promise<VerifiableCredential[]> { /* list all */ }
  async findCredentials(filter: InputDescriptor[]): Promise<VerifiableCredential[]> { /* match */ }
}
```

Build credential storage with adapter pattern:
- `InMemoryCredentialStore` — for testing
- `IndexedDBCredentialStore` — for browser persistence (later)

### Step 3: BrowserKeyStore (Days 5-6)

Add ONE file to `packages/crypto/`:

```typescript
// packages/crypto/src/browser-key-store.ts
// Uses crypto.subtle for non-extractable Ed25519 keys + IndexedDB persistence
export class BrowserKeyStore implements KeyStore {
  async generateKeyPair(algorithm: 'Ed25519'): Promise<{ did: string; publicKey: Uint8Array }> {
    const keyPair = await crypto.subtle.generateKey('Ed25519', false, ['sign']);
    // Store in IndexedDB, return public key for DID generation
  }
  async sign(did: string, data: Uint8Array): Promise<Uint8Array> {
    // Retrieve CryptoKey from IndexedDB, sign via crypto.subtle
  }
  // ... getPublicKey, listKeys, deleteKey
}
```

> [!IMPORTANT]
> This is the ONE exception where you touch another person's package. Add the file and update `packages/crypto/src/index.ts` to export it. Submit as a **separate PR** reviewed by Lead.

### Step 4: Issuance Client (Days 5-7)

Implements the wallet side of the OpenID4VCI flow — talks to the Backend Engineer's issuer server.

```typescript
// packages/wallet/src/issuance-client.ts
export class IssuanceClient {
  async processOffer(offerUrl: string): Promise<VerifiableCredential> {
    // 1. Parse offer URL → extract issuer URL + pre-authorized code
    // 2. GET {issuerUrl}/.well-known/openid-credential-issuer → metadata
    // 3. POST {issuerUrl}/api/token { pre-authorized_code } → { access_token, c_nonce }
    // 4. Create proof-of-possession: JWS over c_nonce with holder key
    // 5. POST {issuerUrl}/api/credential { format, proof } → { credential }
    // 6. Return the VerifiableCredential
  }
}
```

**Use this mock until the issuer is ready:**
```typescript
// packages/wallet/src/__mocks__/mock-credential.ts
import type { VerifiableCredential } from '@breakchain/core';

export const MOCK_CREDENTIAL: VerifiableCredential = {
  '@context': ['https://www.w3.org/ns/credentials/v2'],
  type: ['VerifiableCredential', 'IDCard'],
  issuer: 'did:key:z6MkMockIssuer',
  issuanceDate: new Date().toISOString(),
  credentialSubject: { id: 'did:key:z6MkMockHolder', name: 'Test User', age: 25, nationality: 'US' },
};
```

### Step 5: Presentation Engine (Days 7-9)

```typescript
// packages/wallet/src/presentation-engine.ts
export class PresentationEngine {
  async createPresentation(
    credentials: VerifiableCredential[],
    definition: PresentationDefinition,
    challenge: string,
    mode: 'zkp' | 'sd-jwt' | 'plain'
  ): Promise<{ vp_token: VerifiablePresentation; proof_type: string }> {
    // 'plain' → use createPresentation + signPresentation from @breakchain/credentials
    // 'sd-jwt' → use presentSDJWT from @breakchain/credentials
    // 'zkp' → use ZKProver from @breakchain/prover (or mock until ready)
  }
}
```

**Use this mock until the prover is ready:**
```typescript
// packages/wallet/src/__mocks__/mock-prover.ts
export class MockZKProver {
  async generateProof(inputs: Record<string, bigint>) {
    return {
      proof: { pi_a: ['mock'], pi_b: [['mock']], pi_c: ['mock'] },
      publicSignals: ['1'],
    };
  }
}
```

### Step 6: Wallet HTTP Server (Days 8-9)

Express server at `http://localhost:3002`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/receive-offer` | Accept credential offer URL, run issuance client |
| `GET` | `/api/credentials` | List stored credentials |
| `POST` | `/api/presentation-request` | Receive presentation definition, return VP |

### Your deliverable deadlines
- **Day 4:** Wallet core + storage working with tests
- **Day 6:** BrowserKeyStore PR submitted
- **Day 9:** Full wallet server running, can accept offers and create presentations
- **Demo App (Phase 9):** Starts after integration milestone, ~Day 15

### What you DON'T touch
- `packages/core/`, `packages/did/`, `packages/credentials/` (read-only imports)
- Only touch `packages/crypto/` for the BrowserKeyStore file (separate PR)

---

## 🟠 Lead (You) — Your Plan

### Week 1: SDK Foundation (Days 1-5)

Create `packages/sdk/` and build:

1. **`CipheraSDK` class** — constructor with `SDKConfig`, `connectWallet()`, `disconnect()`
2. **`HttpWalletAdapter`** — HTTP client for wallet at `localhost:3002`
3. **`PresentationRequestBuilder`** — converts `ClaimRequest[]` → DIF `PresentationDefinition`
4. **`ProofOrchestrator`** — coordinates: build definition → send to wallet → receive VP → verify → return

### Week 2: Verification + Integration (Days 6-10)

5. **`VerificationEngine`** — multi-layer verification:
   - Verify holder VP signature (via `@breakchain/credentials verifyPresentation()`)
   - Verify ZK proof (via `@breakchain/prover ZKVerifier` — integrate once ZKP delivers)
   - Check revocation (via `@breakchain/revocation RevocationClient` — integrate once Backend delivers)
6. **Review and merge** teammates' PRs
7. **Integration testing** — wire SDK → Wallet → Issuer

### Week 3: Demo + Polish (Days 11-15)

8. Help Wallet Engineer build demo app
9. Write `npm run demo` launch script
10. End-to-end flow verification
11. Phase 10 hardening kickoff

### Your coordination duties

- **Review all PRs** before merge to `main`
- **Add types to `@breakchain/core`** if any teammate requests them
- **Resolve conflicts** if branches diverge
- **Run full test suite** after each merge: `npm run test --workspaces`

---

## Week-by-Week Sequence

### Week 1 (Days 1-5)

| Person | What they're doing | Blocked on? |
|---|---|---|
| **ZKP** | Writing Circom circuits, compiling, trusted setup | Nothing — independent |
| **BACKEND** | Building Express server, discovery endpoints, token flow, credential issuance | Nothing — uses frozen foundation |
| **WALLET** | Building WalletCore, credential storage, BrowserKeyStore | Nothing — uses mocks for issuer + prover |
| **LEAD** | Building SDK shell, WalletAdapter, PresentationRequestBuilder | Nothing — uses mocks for wallet |

**End of Week 1 check:** Everyone's package scaffolds build. ZKP has at least `ageOver` circuit compiled. Backend has issuer running with discovery endpoints.

### Week 2 (Days 6-10)

| Person | What they're doing | Depends on? |
|---|---|---|
| **ZKP** | Prover wrapper, verifier, tests → **MERGE** | Nothing |
| **BACKEND** | Credential issuance endpoint, revocation → **MERGE** | Nothing |
| **WALLET** | Issuance client, presentation engine | Can test with real issuer once Backend merges |
| **LEAD** | VerificationEngine, integrate prover + revocation | Integrates after ZKP + Backend merge |

**End of Week 2 check:** ZKP and Backend merge to `main`. Wallet can talk to real issuer. SDK can verify ZK proofs.

### Week 3 (Days 11-15)

| Person | What they're doing | Depends on? |
|---|---|---|
| **ZKP** | Help wallet integrate real prover, WebWorker optimization | Done with primary work |
| **BACKEND** | E2E tests, API docs, Postman collection | Done with primary work |
| **WALLET** | Wallet server, integrate real prover + issuer → **MERGE** → Start demo app | ZKP + Backend merged |
| **LEAD** | Full SDK integration → **MERGE** → Demo app with Wallet Engineer | Wallet merged |

**End of Week 3 check:** `npm run demo` starts all 3 servers. Full E2E flow works.

---

## Integration Checkpoints

### Checkpoint 1 — "Everyone builds" (Day 1 end)

```bash
# Run from project root
npm run build --workspaces
```
All packages (including new empty ones) must build without errors.

### Checkpoint 2 — "Prover works" (~Day 7)

```bash
cd packages/prover && npm run test
# Expected: ageOver proof generation + verification tests pass
```

### Checkpoint 3 — "Issuer issues" (~Day 7)

```bash
cd packages/issuer && npm run start
# Then in another terminal:
curl -X POST http://localhost:3001/api/credential-offer -H "Content-Type: application/json" -d '{"type":"IDCard"}'
# Expected: returns { offer, pre_authorized_code }
```

### Checkpoint 4 — "Wallet presents" (~Day 12)

```bash
# Start issuer + wallet
cd packages/issuer && npm run start &
cd packages/wallet && npm run start &
# Wallet receives offer and returns a presentation
curl -X POST http://localhost:3002/api/receive-offer -H "Content-Type: application/json" -d '{"offer_url":"..."}'
curl -X POST http://localhost:3002/api/presentation-request -H "Content-Type: application/json" -d '{"claims":[{"field":"age","condition":">=18"}]}'
```

### Checkpoint 5 — "Full E2E" (~Day 15)

```bash
npm run demo
# All 3 servers start. Open browser to localhost:3000.
# Click "Get Credential" → "Login with ZKP" → See verified result.
```

---

## Daily Standup Format (15 min)

Every day, each person shares (keep it under 2 min each):

1. ✅ **Done yesterday:** What I completed
2. 🔨 **Today:** What I'm working on
3. 🚧 **Blockers:** Am I stuck on anything?

### Common blockers and solutions

| Blocker | Who resolves | How |
|---|---|---|
| "I need a new type in core" | LEAD | Adds it, pushes to main, everyone rebases |
| "Circom won't install" | ZKP + LEAD | Pair session, try Docker alternative |
| "I need to test against the issuer but it's not ready" | WALLET | Use mock credential, test storage/presentation logic |
| "I need prover but it's not merged" | WALLET or LEAD | Use MockZKProver, swap for real one later |
| "Two of us accidentally edited the same file" | LEAD | Resolves conflict, clarifies boundary |

---

## Git Rules Reminder

```
main                         ← always builds, always passes all tests
├── feat/circuits-prover     ← ZKP Engineer
├── feat/issuer-server       ← Backend Engineer
├── feat/wallet-core         ← Wallet Engineer
└── feat/sdk-core            ← Lead
```

1. Everyone branches from `main` TODAY
2. Rebase on `main` daily: `git pull --rebase origin main`
3. PRs require Lead's review before merge
4. Each PR only touches your owned packages
5. Merge order when multiple PRs ready: core changes → ZKP → Backend → Wallet → SDK
