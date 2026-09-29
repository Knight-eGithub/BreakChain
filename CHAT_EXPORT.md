# Chat Export: Breakchain ZKP SDK Architecture & Implementation Analysis

**Date:** 2026-09-28  
**Repository:** [Knight-eGithub/BreakChain](https://github.com/Knight-eGithub/BreakChain)  
**Active Branch:** `solo/curr`  

---

## 1. Codebase Overview: What is happening and why is it called an SDK?

### User Question
> *Tell me about this code base, what is happening, and why is it even called an SDK?*

### Summary & Explanation
The repository is the **Breakchain ZKP Credential Ecosystem** — a monorepo implementing a privacy-preserving identity verification system based on:
- **W3C Verifiable Credentials Data Model v2**
- **Decentralized Identifiers (DIDs)** (`did:key`, `did:web`)
- **OpenID4VCI & OpenID4VP** (issuance and presentation protocols)
- **Zero-Knowledge Proofs (ZKPs)** using Circom circuits and Groth16 (`snarkjs`) on the `bn128` elliptic curve
- **Selective Disclosure JWT (SD-JWT)**

#### Why is it called an "SDK"?
In standard decentralized identity architecture, a web or mobile application developer (the **Verifier**) does not want to write raw cryptographic equations, compile Circom circuits, or handle complex cryptographic handshakes. They want an easy **Software Development Kit (SDK)** with a concise API:

```typescript
import { BreakchainSDK } from '@breakchain/sdk';

const sdk = new BreakchainSDK({ walletUrl: '...', issuerUrl: '...' });
await sdk.connectWallet();

// Request proof: Verify user age >= 18 without revealing birthdate or name
const result = await sdk.requestProof({
  claims: [{ field: 'age', condition: '>=18' }],
  mode: 'zkp',
});

if (result.verified) {
  console.log('Age verified with zero-knowledge proof');
}
```

The core deliverable of the project is the developer-facing library: [`@breakchain/sdk`](packages/sdk).

#### Why does the repository contain an Issuer and Wallet too?
In the real world:
- The **Issuer** is an external authority (e.g. government, DMV, bank).
- The **Wallet** is user-held software (e.g. Apple Wallet, mobile identity app).
- The **Verifier App** uses the SDK to query the wallet.

During early development and testing, you cannot build or test an SDK without an Issuer to issue test credentials and a Wallet to store them and generate proofs. Thus, this repository is a **complete monorepo testbed**: it contains the SDK along with reference/simulator implementations of the Issuer, the Wallet, the cryptographic primitives, and the compiled ZK circuits.

#### High-Level 3-Party Architecture
```
Issuer (@breakchain/issuer)
   │  Issues signed Verifiable Credential (OpenID4VCI)
   ▼
Wallet (@breakchain/wallet)  <── Holds keys & generates Groth16 proofs locally
   ▲
   │  Presentation Request / Response (OpenID4VP)
   ▼
Verifier Web App using SDK (@breakchain/sdk)
```

#### Package Breakdown
| Package | Description |
|---|---|
| `packages/sdk` | Developer-facing 3-method API (`connectWallet`, `requestProof`, `verifyPresentation`). |
| `packages/circuits` | Circom circuits (`age_over`, `nationality_check`, `credential_ownership`) + compiled WASM and `.zkey`. |
| `packages/prover` | Groth16 prover / verifier wrapper around `snarkjs` and witness generation. |
| `packages/credentials` | W3C VC/VP creation, verification, and SD-JWT (Selective Disclosure JWT) logic. |
| `packages/crypto` | Ed25519 signatures (`@noble/curves`), JWS, SHA-256 / Poseidon hashing, PKCE. |
| `packages/did` | `did:key` and `did:web` resolution logic. |
| `packages/issuer` | Reference Express + SQLite server implementing OpenID4VCI credential issuance & revocation. |
| `packages/wallet` | Reference holder wallet handling keys, credential storage, and proof execution. |
| `packages/core` | Shared interfaces, constants, types, and error definitions. |

---

## 2. Current Git Branch

### User Question
> *What branch are we currently in?*

### Finding
The repository is on branch:
```bash
solo/curr
```

---

## 3. Verification: Does it really do what it claims?

### User Question
> *Just check if it really does what it claims.*

### Verification Actions & Results
Both test execution and full monorepo compilation were performed to verify the claims:

1. **Test Suite Execution (`npx vitest run`)**:
   - **Result:** **139 tests passed across 8 test suites (0 failures).**
   - **Real ZK Proof Execution:** `packages/circuits/src/__tests__/circuits.test.ts` ran real Groth16 proof generation and verification using `snarkjs` and compiled WASM circuits:
     - `age_over`: Verified proof succeeds for `age = 25` against Poseidon hash commitments.
     - Rejected witness generation for invalid conditions (`age = 16`).
     - `nationality_check`: Verified nationality matches expectation and rejects invalid claims.
     - `credential_ownership`: Verified ownership proofs without exposing secrets.
   - **Cryptographic & Protocol Tests:** Ed25519 digital signatures, DID resolution, SD-JWT disclosure, issuer endpoints, and wallet presentation engine all passed.

2. **Monorepo Build Execution (`npm run build --workspaces --if-present`)**:
   - Successfully compiled all packages (`@breakchain/core`, `@breakchain/crypto`, `@breakchain/did`, `@breakchain/credentials`, `@breakchain/prover`, `@breakchain/circuits`, `@breakchain/issuer`, `@breakchain/wallet`, `@breakchain/sdk`, and `@breakchain/demo-app`).
   - Generated CommonJS (`dist/index.js`), ES Modules (`dist/index.mjs`), and TypeScript Declarations (`dist/index.d.ts`).

---

## 4. Real-World Viability Assessment

### User Question
> *Is it really usable in real world dev scenario?*

### Evaluation
**Verdict: It is a functional reference implementation and prototyping testbed, but not yet drop-in production-ready.**

#### What is genuinely production-grade:
- Real Groth16 ZK-SNARKs and Poseidon hash circuits (not mocks).
- Real Ed25519 signatures using `@noble/curves`.
- Strict alignment with W3C VC v2, DIF Presentation Exchange v2, and SD-JWT standards.
- Strong modular architecture and clean TypeScript interfaces.

#### Gaps preventing immediate direct production deployment:
1. **Wallet Transport is HTTP-only:** The reference adapter (`HttpWalletAdapter`) expects an HTTP wallet server at `http://localhost:3002`. Real-world production requires QR codes, deep links (`openid4vp://`), or browser extension messaging (`window.postMessage` / W3C Digital Credentials API).
2. **Trusted Setup / Ceremonies:** Circuit `.zkey` files were generated with single-contributor local entropy rather than a public Multi-Party Computation (MPC) Powers-of-Tau ceremony.
3. **Hardcoded / Inflexible Circuits:** Circuits currently hardcode constraints (e.g. `age >= 18`). Verifying `age >= 21` requires compiling and deploying an entirely new circuit.
4. **Key Custody in Memory:** The reference wallet stores private keys in memory/SQLite instead of device hardware security modules (Apple Secure Enclave, Android StrongBox/Keystore).
5. **Simulated Issuer:** The issuer is a local server without links to verified identity providers (eIDAS 2.0, government eID, bank ID).

---

## 5. Implementability & Production Roadmap

### User Question
> *Is it implementable?*

### Assessment & Steps
**Yes, absolutely.** The codebase's core architecture was intentionally designed for modularity:

1. **Upgrade Wallet Transport:** Replace `HttpWalletAdapter` with an `OpenID4VPAdapter` that encodes authorization requests into QR codes or deep links for mobile wallets.
2. **Parameterize Circuits:** Update Circom circuits to accept threshold values (e.g. `age >= threshold`) as public inputs, allowing arbitrary age gates (18, 21, 65) with a single compiled circuit.
3. **Adopt SD-JWT for Broad Compatibility:** The repository already implements SD-JWT in `packages/credentials`. For non-numeric claims (selective disclosure of nationality, verified badge), SD-JWT is standardized by the EU Digital Identity Wallet (EUDI) and requires no ZK ceremonies.
4. **Hardware Key Binding:** Bind holder keys to WebAuthn / Secure Enclave on mobile platforms.
5. **Real-world Issuer Bridge:** Connect the issuer backend to existing OAuth2/OIDC providers.

---

## 6. Distribution & Developer Consumption (How Devs Get and Use It)

### User Question
> *Assume it has done whatever you said, then how and where should I make it available and how will the devs get it to use it?*

### Strategy
1. **Distribution Channels:**
   - **npm Registry:** Publish `@breakchain/sdk` to npm. Developers install via `npm install @breakchain/sdk`.
   - **CDN / Script Tag:** Provide bundled builds on jsDelivr/unpkg for non-Node web apps (Shopify, Webflow).
2. **Developer Integration Flow:**
   - **Frontend (Client-side):** Developer uses SDK to display a verification modal or trigger a QR code for the user's wallet.
   - **Backend (Server-side):** Developer imports `@breakchain/sdk/server` to cryptographically verify the presentation before granting access, creating an account, or issuing a session.

---

## 7. Cloud vs. Pure Peer-to-Peer / Local-First

### User Question
> *Wait, cloud is needed? Why though?*

### Clarification
**No, third-party cloud infrastructure is NOT strictly needed.**

Zero-Knowledge Proofs and W3C Verifiable Credentials are **inherently decentralized, local-first, and peer-to-peer**:

1. **Direct Communication without Cloud Relays:**
   - **Browser Extensions:** When the wallet is an extension, the web page talks directly to the wallet via `window.postMessage` in local memory. Cloud servers involved: **Zero**.
   - **Direct QR Code Handshake:** The web page encodes the request directly into the QR code (`openid4vp://?response_uri=https://developer-site.com/api/verify...`). The phone scans the QR, computes the ZK proof on the phone's CPU via WASM, and `POST`s the proof directly to the developer's website. No third-party relay ever sees or processes the data.
2. **Pure Mathematical Verification:**
   - Groth16 and Ed25519 verification are pure algorithms running in WebAssembly and JavaScript. Neither the developer nor the user needs an external API to verify validity.
3. **Packaging Artifacts:**
   - Circuit files (`.wasm`, `.zkey`) can be bundled directly inside the npm package or served as static assets from the developer's own `/public` directory.

#### Why Commercial Products Use Cloud:
Commercial identity vendors (Stripe Identity, SaaS ID platforms) introduce cloud relays primarily to support SaaS subscription models (charging per API call) or to simplify local localhost network traversal during development. 

For an open-source, privacy-first SDK, **a 100% cloudless, peer-to-peer architecture is fully achievable and architecturally cleaner.**
