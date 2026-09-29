# How to Explain the Team Plan to Your Teammates

This is the plain-English version of everything in the team artifacts. Read this, and you'll know exactly what to tell each person.

---

## The Big Picture — What Are We Building?

We're building a **Zero-Knowledge Proof (ZKP) Credential SDK**. Think of it like this: a website wants to verify that a user is over 18, but the user shouldn't have to reveal their actual age. Our SDK makes that possible.

The system has **5 moving parts:**

1. **An Issuer Server** — like a government office that issues ID cards. It creates and signs digital credentials (think: digital driver's license).
2. **A Wallet** — like a digital wallet on your phone that stores those credentials and can prove things about them.
3. **A ZK Proof System** — the math engine that lets the wallet prove "I'm over 18" without revealing the actual birthdate.
4. **The SDK** — the developer-facing library. A web developer drops this into their app, calls `sdk.requestProof()`, and gets back a yes/no answer.
5. **A Demo App** — a website that shows the full flow working end-to-end.

**I (you, the Lead) have already built the foundation** — the core types, cryptographic primitives, DID resolution, and credential creation/verification. That's 53 passing tests across 4 packages. Now we split the remaining work among 4 people.

---

## What's Already Built (The Foundation)

Before you talk to anyone, make sure they understand this: **there are 4 packages already built and working. Nobody touches these.** They just import from them.

- **`@breakchain/core`** — All the TypeScript types and interfaces. When someone needs to know "what does a VerifiableCredential look like?", it's defined here. Also has error classes and constants.

- **`@breakchain/crypto`** — Ed25519 key generation, signing, verification, SHA-256 hashing, JWS (JSON Web Signatures), JWK (JSON Web Keys), and a `KeyStore` for managing keys in memory. This is the crypto toolkit everyone imports from.

- **`@breakchain/did`** — DID (Decentralized Identifier) resolution. It can create `did:key` identifiers from public keys and resolve them back to get DID Documents. Also supports `did:web`. Has a unified `createResolver()` that any package can use.

- **`@breakchain/credentials`** — Creating, signing, and verifying Verifiable Credentials (VCs) and Verifiable Presentations (VPs). Also has the full SD-JWT (Selective Disclosure JWT) flow for when you want to reveal only some fields of a credential. Has high-level `verifyCredential()` and `verifyPresentation()` functions that integrate with the DID resolver automatically.

**The key point:** These 4 packages are "frozen". Their public API (the functions and types they export) won't change. Everyone codes against them like a stable library.

---

## The Golden Rules — Tell Everyone These

Before assigning any work, make sure every teammate understands these non-negotiable rules:

1. **You only touch YOUR packages.** If you're the ZKP Engineer, you only write code in `packages/circuits/` and `packages/prover/`. You never edit files in `packages/core/` or `packages/wallet/` or anyone else's folder.

2. **Need a new type?** Ask the Lead (you). You'll add it to `@breakchain/core` and push it to `main`. Nobody else modifies `core`.

3. **Program against interfaces, not implementations.** Everyone imports the same frozen foundation. If the Wallet needs the prover but it's not ready yet, they use a mock. They don't wait.

4. **Rebase on `main` daily.** Every morning: `git pull --rebase origin main`. This keeps branches clean and prevents painful merge conflicts later.

5. **Every PR needs the Lead's review before merging.** This ensures quality and catches any boundary violations.

6. **One exception:** The Wallet Engineer gets to add ONE file to `packages/crypto/` — the `BrowserKeyStore`. But it goes through a separate PR reviewed by the Lead.

---

## How to Assign Each Role — Exactly What to Say

### Teammate 1: ZKP Engineer

**Who should this be?** The person most comfortable with math, cryptography, and low-level tooling. They'll work with Circom (a circuit language) and snarkjs (a ZK proof library). This is the most technically challenging role.

**Here's what you'd tell them:**

> "Your job is to build the zero-knowledge proof system. You own two packages: `circuits` and `prover`.
>
> **First, you'll write ZK circuits using Circom.** A circuit is like a math program that proves something without revealing the inputs. You need to build 3 circuits:
>
> 1. **`ageOver`** — proves a person's age is above a threshold (like ≥18) without revealing the actual age. It works by hashing the age with a random salt using Poseidon (a ZK-friendly hash function), then checking that the age is at least the threshold.
>
> 2. **`nationalityCheck`** — proves a person's nationality matches an expected value without revealing it. Same idea: hash the nationality, compare the hash.
>
> 3. **`credentialOwnership`** — proves that a specific DID (digital identity) owns a specific credential. This prevents someone from using someone else's credential.
>
> After writing each circuit, you'll compile it with the Circom compiler (which outputs a `.wasm` file and an `.r1cs` file), then run a trusted setup ceremony to generate proving keys (`.zkey`) and verification keys (`verification_key.json`). Commit all these artifacts to the repo so others can use them.
>
> **Second, you'll build JavaScript wrappers around snarkjs.** These are TypeScript classes that make it easy for the wallet and SDK to use the circuits:
>
> - `ZKProver` — takes a circuit's WASM file and zkey, plus the user's private inputs (like their actual age), and generates a proof. Under the hood it calls `snarkjs.groth16.fullProve()`.
>
> - `ZKVerifier` — takes a verification key and a proof, and checks if the proof is valid. Under the hood it calls `snarkjs.groth16.verify()`.
>
> - `CircuitSelector` — given a claim request like "prove age >= 18", it figures out which circuit to use (`ageOver`) and what input mapping to apply.
>
> - `WitnessGenerator` — takes the raw credential data (like `age: 25`) and converts it into the format the circuit expects (bigint values with Poseidon hashing).
>
> **Your imports:** You only import types from `@breakchain/core` (like `ZKProof`, `ClaimRequest`). You don't import from crypto, did, or credentials.
>
> **Your exports:** `ZKProver`, `ZKVerifier`, `CircuitSelector`, `WitnessGenerator`. These are the classes the wallet and SDK will import.
>
> **Your branch:** `feat/circuits-prover`. Create your package scaffolds on day 1 (package.json, tsconfig.json, empty index.ts), then start on the circuits.
>
> **Your deadline:** About 7 working days. After that, we merge your branch and the wallet can start using real proofs instead of mocks.
>
> **Write tests** that prove: age=25 with threshold=18 generates a valid proof. age=16 with threshold=18 fails. Nationality match works, mismatch fails."

---

### Teammate 2: Backend Engineer

**Who should this be?** Someone comfortable with Node.js, Express, REST APIs, and databases. They don't need deep crypto knowledge — the foundation packages handle all the signing.

**Here's what you'd tell them:**

> "Your job is to build the credential issuer server and the revocation system. You own two packages: `issuer` and `revocation`.
>
> **The issuer server is an Express.js app running at `http://localhost:3001`.** It simulates a government or organization that issues digital credentials. Think of it like: someone walks up to a government office, proves who they are, and gets a signed digital ID card.
>
> The issuance follows the OpenID4VCI standard. Here's the flow in plain English:
>
> 1. The wallet calls `POST /api/credential-offer` saying "I want an IDCard credential". The issuer creates an offer with a pre-authorized code and returns it.
>
> 2. The wallet takes that code and calls `POST /api/token` to exchange it for an access token and a challenge nonce (`c_nonce`).
>
> 3. The wallet proves it controls its DID by signing the c_nonce, then calls `POST /api/credential` with that proof. The issuer validates everything, builds the credential using `createCredential()` and `signCredential()` from `@breakchain/credentials`, stores a record in SQLite, and returns the signed credential.
>
> You also need 3 discovery endpoints that follow OpenID standards: `GET /.well-known/openid-credential-issuer` (lists what credential types the issuer supports), `GET /.well-known/oauth-authorization-server` (lists the token endpoint), and `GET /.well-known/did.json` (serves the issuer's DID Document).
>
> **For key management:** On server startup, generate an Ed25519 keypair using `generateEd25519KeyPair()` from `@breakchain/crypto`, derive a `did:key` using `generateDidKey()` from `@breakchain/did`. Use these to sign every credential you issue.
>
> **For the database:** Use SQLite with a `credentials` table (id, holder_did, type, status, status_index, issued_at) and a `tokens` table (code, access_token, c_nonce, holder_did, credential_type, created_at, used).
>
> **The revocation system** adds 3 more endpoints to your issuer server:
>
> - `GET /api/status?id=<credentialId>` — returns whether a credential is revoked
> - `POST /api/revoke` — marks a credential as revoked (only the issuer can call this)
> - `GET /api/status-list` — returns a signed StatusList2021 credential containing a bitstring of all credential statuses
>
> Plus, in a separate `packages/revocation/` package, build a `RevocationClient` class that the SDK will use to check credential status. It's a simple HTTP client: `new RevocationClient('http://localhost:3001')`, then `client.checkStatus('cred-id')`.
>
> **Your imports:** You import from all 4 foundation packages — types from core, key generation from crypto, DID generation from did, and credential creation/signing from credentials.
>
> **Your exports:** `createIssuerServer(config)` from the issuer package, and `RevocationClient` + `StatusListGenerator` from the revocation package.
>
> **Your branch:** `feat/issuer-server`. 
>
> **Your deadlines:** Day 5 — issuer server running and testable with curl. Day 8 — revocation endpoints working and `RevocationClient` exported.
>
> **Test it** by running the full flow with curl: create offer → exchange for token → request credential. Then: issue credential → verify status (active) → revoke → verify status (revoked)."

---

### Teammate 3: Wallet Engineer

**Who should this be?** A fullstack developer comfortable with TypeScript, browser APIs (IndexedDB, crypto.subtle), Express, and eventually React. They have the longest workload.

**Here's what you'd tell them:**

> "Your job is to build the digital wallet and eventually the demo app. You own `packages/wallet/` and later `packages/demo-app/`.
>
> **The wallet is the user's side of the system.** It stores credentials, talks to the issuer to get new ones, and creates presentations (proofs) when a website asks. Think of it like a digital wallet on your phone.
>
> **Week 1 — Wallet Core:**
>
> Build a `WalletCore` class. When it starts up, it generates a new Ed25519 keypair via the `KeyStore` interface and derives a `did:key` from the public key. The class has methods to:
> - `addCredential(vc)` — first verify the issuer's signature using `verifyCredential()` from `@breakchain/credentials`, then store it
> - `getCredentials()` — return all stored credentials
> - `findCredentials(filter)` — match credentials against an `InputDescriptor[]` (from a presentation request)
>
> For storage, use an adapter pattern: define a `CredentialStore` interface, then implement `InMemoryCredentialStore` (for testing) and `IndexedDBCredentialStore` (for browser persistence). The wallet core takes a store in its constructor.
>
> Also build the `BrowserKeyStore` — this goes in `packages/crypto/src/browser-key-store.ts` (this is the one exception where you touch someone else's package). It implements the existing `KeyStore` interface but uses `crypto.subtle` for non-extractable Ed25519 keys and IndexedDB for persistence. Submit this as a separate PR for me to review.
>
> **Week 2 — Issuance Client and Presentation Engine:**
>
> The `IssuanceClient` handles getting credentials from the issuer. Given an offer URL, it: parses the offer, fetches issuer metadata from `/.well-known/openid-credential-issuer`, exchanges the pre-authorized code for an access token via `POST /api/token`, creates a proof-of-possession by signing the c_nonce with the wallet's key, then requests the credential via `POST /api/credential`.
>
> **Important:** The issuer's API endpoints are defined in our implementation plan. Both you and the Backend Engineer should treat those as the contract. Talk to each other early if anything is unclear.
>
> The `PresentationEngine` is the brain that creates proofs. It receives a presentation definition (what claims the verifier wants), finds matching credentials, then selects a proof mode:
> - **Plain VP mode:** just wrap the credential in a Verifiable Presentation and sign it with the holder's key. Use `createPresentation()` and `signPresentation()` from `@breakchain/credentials`.
> - **SD-JWT mode:** use `presentSDJWT()` from `@breakchain/credentials` to reveal only selected fields.
> - **ZKP mode:** extract the private inputs from the credential, use `CircuitSelector` to pick the right circuit, use `WitnessGenerator` to format the inputs, then call `ZKProver.generateProof()`. **Until the ZKP Engineer delivers, use a `MockZKProver` that returns fake proofs.** You'll swap it for the real one later.
>
> Finally, wrap everything in an Express server at `:3002` with 3 endpoints: `POST /api/receive-offer`, `GET /api/credentials`, `POST /api/presentation-request`.
>
> **Week 3 — Demo App (with me):**
>
> We'll build a Vite + React app at `:3000` together. It'll have 3 pages: one to get a demo credential (triggers the issuer → wallet flow), one to "Login with ZKP" (triggers the SDK → wallet → proof flow), and an admin page to revoke credentials. Plus a `npm run demo` script that starts all 3 servers.
>
> **Your imports:** All 4 foundation packages plus `@breakchain/prover` once it's ready.
>
> **Your exports:** `WalletCore`, `IssuanceClient`, `createWalletServer()`.
>
> **Your branch:** `feat/wallet-core`.
>
> **Mock everything you're waiting on.** Don't block yourself waiting for the issuer or prover. Use mock credentials and a mock prover. When the real ones merge to main, swap your mocks for real imports."

---

### You (Lead) — Your Own Work

> **Your job has two parts: build the SDK and coordinate the team.**
>
> **Week 1 — SDK Foundation:**
>
> Build `packages/sdk/` with a `CipheraSDK` class. This is what web developers will actually use. It has:
> - `connectWallet()` — connects to the wallet server via HTTP
> - `requestProof({ claims, mode })` — the main method that triggers the entire flow
> - `verifyPresentation(vp)` — verifies a received presentation
>
> Under the hood, build:
> - `HttpWalletAdapter` — makes HTTP calls to the wallet at `:3002`. Implements the `WalletAdapter` interface from core.
> - `PresentationRequestBuilder` — converts simple claim requests (like `{ field: 'age', condition: '>=18' }`) into the DIF Presentation Definition JSON format that the wallet understands.
> - `ProofOrchestrator` — the main coordinator that: builds the presentation definition → sends it to the wallet → receives the VP back → passes it through verification → returns the result to the developer.
>
> **Week 2 — Verification Engine:**
>
> Build the `VerificationEngine` that performs multi-layer verification:
> 1. Verify the holder's VP signature (is this really from the wallet's DID?) — using `verifyPresentation()` from `@breakchain/credentials`
> 2. Verify each embedded VC's issuer signature (was this credential really issued by that issuer?) — using `verifyCredential()`  
> 3. Verify the ZK proof (does the math check out?) — using `ZKVerifier` from `@breakchain/prover`
> 4. Check revocation (is this credential still valid?) — using `RevocationClient` from `@breakchain/revocation`
>
> Use mocks for the prover and revocation client until those packages merge.
>
> **Coordination duties:** Review all PRs. Add types to core when requested. Resolve merge conflicts. Run the full test suite after each merge.

---

## How the Timeline Works

**Phase A (already done):** You built the foundation alone. 4 packages, 53 tests, everything frozen.

**Phase B (starts now, ~2 weeks):** All 4 people work in parallel on their own branches. Nobody blocks each other because everyone uses mocks for dependencies that aren't ready yet.

- **Day 1:** Everyone clones the repo, runs the tests to verify everything works, creates their branch, scaffolds their packages (just package.json + tsconfig + empty index.ts), and verifies `npm run build` still passes.

- **Days 2-5:** Everyone is heads-down building their core modules. The ZKP Engineer is writing circuits. The Backend Engineer is building the issuer server. The Wallet Engineer is building wallet core and storage. You're building the SDK shell.

- **Days 6-7:** The ZKP Engineer finishes circuits and starts on the prover wrapper. The Backend Engineer finishes the issuer and starts on revocation. The Wallet Engineer starts on BrowserKeyStore and the issuance client.

- **Days 7-10:** The ZKP Engineer and Backend Engineer finish and merge their PRs. Now the Wallet Engineer and you can swap mocks for real implementations.

**Phase C (last week, ~5 days):** Convergence. Everyone's code merges. Integration testing. Build the demo app. Hardening and docs.

---

## How to Handle Blockers

The most important principle: **never wait for someone else's code. Use a mock.**

Here are the specific scenarios:

**"The wallet needs the prover but it's not done"** — Use `MockZKProver` that returns fake proofs. The wallet's presentation engine logic (selecting credentials, formatting inputs, building VPs) works the same regardless of whether the proof is real or fake. When the prover merges, just change the import.

**"The wallet needs the issuer but it's not done"** — Use a `MOCK_CREDENTIAL` constant. It's a hardcoded VerifiableCredential object. The wallet can test storing, retrieving, and presenting credentials without ever talking to a real issuer.

**"The SDK needs the revocation client but it's not done"** — Use `MockRevocationClient` that always returns `{ revoked: false }`. The SDK's verification engine processes the revocation result the same way regardless.

**"Someone needs a new TypeScript type"** — They message you (the Lead). You add it to `@breakchain/core`, push to `main`, and everyone rebases. This should take less than an hour.

**"Two people accidentally edited the same file"** — This shouldn't happen if everyone follows the package ownership rule. If it does, you (the Lead) resolve the conflict.

---

## The Daily Standup

Every day, have a 15-minute call or async message. Each person answers 3 questions:

1. **What did I finish yesterday?** (e.g., "ageOver circuit compiled and artifacts committed")
2. **What am I working on today?** (e.g., "Starting nationalityCheck circuit")
3. **Am I blocked on anything?** (e.g., "No" or "Circom won't install, need help")

That's it. Keep it short. If someone is blocked, pair up after the standup to fix it — don't solve it during the standup.

---

## The Git Workflow — Simplified

```
main  ←  always works, always passes all tests
  ├── feat/circuits-prover    (ZKP Engineer works here)
  ├── feat/issuer-server      (Backend Engineer works here)  
  ├── feat/wallet-core        (Wallet Engineer works here)
  └── feat/sdk-core           (You work here)
```

**How it works:**

1. Everyone branches from `main` on Day 1.
2. Every morning, everyone does `git pull --rebase origin main` to stay current.
3. When someone's work is done, they open a PR to merge into `main`.
4. You (Lead) review every PR. Check that they only touched their own packages.
5. After merging, everyone rebases again to pick up the changes.

**Merge order when multiple PRs are ready at the same time:**
1. Your core/type changes (if any)
2. ZKP Engineer's circuits + prover
3. Backend Engineer's issuer + revocation
4. Wallet Engineer's wallet
5. Your SDK

This order works because each subsequent PR might depend on the one before it.

---

## Summary — The One-Paragraph Version

You've built a solid foundation (core, crypto, DID, credentials — 53 tests). Now 4 people split up: the ZKP Engineer builds the math proof system (circuits + prover), the Backend Engineer builds the credential issuer server and revocation, the Wallet Engineer builds the digital wallet that stores credentials and creates presentations, and you build the SDK that ties it all together plus coordinate the team. Everyone works on their own branch, in their own packages, importing from the frozen foundation. Nobody waits for anyone — they use mocks until real implementations merge. After ~2 weeks of parallel work, everything converges into a working demo app. The 5 integration milestones (everyone builds → prover works → issuer issues → wallet presents → full E2E) keep the team synchronized without blocking each other.
