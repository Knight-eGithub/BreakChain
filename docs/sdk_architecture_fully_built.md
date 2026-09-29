# SDK Architecture (Fully Built State)

This document details the **production architecture** of the Breakchain ZKP Ecosystem. It encompasses the client-side developer SDK, the server-side verification engine, the multi-transport wallet adapters, the reference backend simulators (Issuer & Wallet), and the parameterized Groth16 ZKP proving mechanics.

```mermaid
graph TD
    %% Define Styles
    classDef frontend fill:#18181b,stroke:#3f3f46,stroke-width:2px,color:#fafafa;
    classDef sdkPackage fill:#0f0f12,stroke:#10b981,stroke-width:2px,color:#fafafa;
    classDef backend fill:#18181b,stroke:#8b5cf6,stroke-width:2px,color:#fafafa;
    classDef zkp fill:#18181b,stroke:#06b6d4,stroke-width:2px,color:#fafafa;
    classDef db fill:#09090b,stroke:#64748b,stroke-width:2px,color:#fafafa;

    %% Verifier Application
    subgraph Verifier App ["Consumer Verifier Application (e.g. Next.js Showcase)"]
        UI["<b>Web / Mobile UI</b><br/>(React / Next.js 16 App Router)"]:::frontend
        ClientSDK["<b>BreakchainSDK (Client)</b><br/>- connectWallet()<br/>- requestProof()"]:::sdkPackage
        ServerAPI["<b>Backend API Route (/api/verify)</b><br/>- verifyPresentation()<br/>- Session Grant"]:::frontend
        ServerVerifier["<b>@breakchain/sdk/server</b><br/>- 5-Layer Crypto Engine<br/>- Independent Verifier"]:::sdkPackage
    end

    %% Transport Adapters
    subgraph Transport Layer ["Wallet Transport Adapters (@breakchain/sdk)"]
        PMAdapter["<b>PostMessageWalletAdapter</b><br/>(Extensions & Embedded Iframes)"]:::sdkPackage
        DLAdapter["<b>DeepLinkWalletAdapter</b><br/>(Mobile Apps openid4vp:// & QR)"]:::sdkPackage
        HTTPAdapter["<b>HttpWalletAdapter</b><br/>(HTTP REST / SSE)"]:::sdkPackage
    end

    %% Breakchain Core SDK Layers
    subgraph SDK Ecosystem ["Core Breakchain Packages (npm workspaces)"]
        Core["<b>@breakchain/core</b><br/>(Shared Types, Errors, Interfaces)"]:::sdkPackage
        Crypto["<b>@breakchain/crypto</b><br/>(Ed25519, JWS, KeyStore)"]:::sdkPackage
        DID["<b>@breakchain/did</b><br/>(did:key, did:web resolvers)"]:::sdkPackage
        Credentials["<b>@breakchain/credentials</b><br/>(VC/VP v2, SD-JWT Engine)"]:::sdkPackage
    end

    %% Prover and Circuits
    subgraph ZKP Engine ["Zero-Knowledge Prover Engine"]
        Prover["<b>@breakchain/prover</b><br/>(snarkjs wrapper, Witness Gen)"]:::zkp
        Circuits["<b>@breakchain/circuits</b><br/>(Parameterized Circom WASM & zkey)"]:::zkp
    end

    %% Server Simulators
    subgraph Ecosystem Nodes ["Ecosystem Nodes & Registries"]
        Wallet["<b>@breakchain/wallet</b><br/>(Identity, Keystore, Proof Engine)"]:::backend
        Issuer["<b>@breakchain/issuer</b><br/>(OpenID4VCI Server, Ed25519 Signer)"]:::backend
        StatusList["<b>StatusList2021 Registry</b><br/>(Live Revocation Bitstring)"]:::backend
        DB[("SQLite Database<br/>(Credentials & Audit Logs)")]:::db
    end

    %% Communication Flow
    UI -->|Calls| ClientSDK
    ClientSDK -->|Selects Transport| PMAdapter
    ClientSDK -->|Selects Transport| DLAdapter
    ClientSDK -->|Selects Transport| HTTPAdapter

    PMAdapter -->|window.postMessage RPC| Wallet
    DLAdapter -->|openid4vp:// deep link| Wallet
    HTTPAdapter -->|HTTP POST| Wallet

    Wallet -->|Generates Groth16 Proof| Prover
    Prover -->|Loads WASM & zkey| Circuits
    Wallet -->|Secure Key Mgmt| Crypto
    Wallet -->|Builds VP| Credentials

    UI -.->|Submits VP Presentation| ServerAPI
    ServerAPI -->|Independent Verification| ServerVerifier
    ServerVerifier -->|1. Resolves DIDs| DID
    ServerVerifier -->|2. Verifies ZK Proof| Prover
    ServerVerifier -->|3. Validates Signatures| Crypto
    ServerVerifier -->|4. Checks Revocation| StatusList

    Wallet -->|OID4VCI Get Credential| Issuer
    Issuer -->|Signs VC/SD-JWT| Crypto
    Issuer -->|Issues Credentials| Credentials
    Issuer -->|Persists Data| DB
    Issuer -->|Updates Bitstring| StatusList
```

---

## Architectural Highlights

### 1. Dual-Sided Verification Architecture
* **Client-Side (`@breakchain/sdk`)**: Integrates into the frontend to handle wallet connection, user consent, and proof requests across 3 transport mechanisms (`PostMessage`, `DeepLink`, and `HTTP`).
* **Server-Side (`@breakchain/sdk/server`)**: Enforces cryptographic integrity on backend API routes (e.g. Next.js Route Handlers) to verify presentations independently without trusting the client browser.

### 2. The 5-Layer Cryptographic Pipeline
The server verification engine evaluates every presentation across 5 distinct security layers:
1. **Schema Check**: Validates that the presented credential contains the requested attribute.
2. **Issuer Authority Signature**: Verifies the `Ed25519Signature2020` / JWS digital signature of the issuer's DID.
3. **Condition Proof**: Evaluates the Groth16 mathematical zero-knowledge proof or SD-JWT disclosure against the threshold.
4. **Holder Key Binding**: Verifies that the presenter signed a server nonce challenge using the private key matching the credential's `holderDid` (prevents stolen token attacks).
5. **Real-Time Revocation**: Queries the issuer's live StatusList2021 registry for active status.

### 3. Parameterized Groth16 Circuits
Circuits in `@breakchain/circuits` accept dynamic parameters (e.g., `ageThreshold` in `age_over.circom`). This eliminates the need for hardcoded limits and allows a single compiled circuit artifact to verify arbitrary thresholds (`18+`, `21+`, `65+`, etc.).

### 4. Reference Full-Stack Showcase
Demonstrated in `breakchain-showcase` (Next.js 16 App Router / React 19):
* Real-world implementations of 3 consumer applications:
  * **Viper Esports 21+ VIP Tournament** (`age >= 21` via Groth16 ZKP)
  * **National Citizen Service Portal** (`nationality == 356 IND` via ZKP)
  * **TechCareers Engineering Gateway** (`degree == 'B.Tech'` via SD-JWT)
* Dynamic 3-tier credential categorization:
  * ✅ *Has Criteria & Meets Condition*
  * ❌ *Has Criteria & Fails Condition*
  * ⚠️ *Missing Criteria (Incompatible Schema)*
