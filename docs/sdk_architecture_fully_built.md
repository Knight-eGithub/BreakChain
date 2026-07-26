# SDK Architecture (Fully Built State)

This diagram represents the **complete, final architecture** of the Breakchain ZKP Ecosystem once all phases (up to Phase 10) are successfully implemented. It includes the developer SDK, the backend simulated servers (Issuer & Wallet), and the ZKP proving mechanisms.

```mermaid
graph TD
    %% Define Styles
    classDef frontend fill:#fff9c4,stroke:#fbc02d,stroke-width:2px;
    classDef sdkPackage fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;
    classDef backend fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px;
    classDef zkp fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px;
    classDef db fill:#eceff1,stroke:#607d8b,stroke-width:2px;

    %% Verifier Application
    subgraph Verifier App ["Demo Web App (Verifier)"]
        UI[Web UI<br/>(React/Next.js)]:::frontend
        SDKApi["BreakchainSDK<br/>(connectWallet, requestProof, verify)"]:::sdkPackage
    end

    %% Breakchain Core SDK Layers
    subgraph SDK Ecosystem ["Breakchain Packages (npm workspaces)"]
        Revocation["@breakchain/revocation<br/>(Status List Checking)"]:::sdkPackage
        Core["@breakchain/core<br/>(Shared Types)"]:::sdkPackage
        Crypto["@breakchain/crypto<br/>(KeyStore, Crypto Ops)"]:::sdkPackage
        DID["@breakchain/did<br/>(did:key, did:web)"]:::sdkPackage
        Credentials["@breakchain/credentials<br/>(VC/VP, SD-JWT)"]:::sdkPackage
    end

    %% Prover and Circuits
    subgraph ZKP Engine ["Zero-Knowledge Prover"]
        Prover["@breakchain/prover<br/>(snarkjs wrapper, Witness Gen)"]:::zkp
        Circuits["@breakchain/circuits<br/>(Circom WASM assets)"]:::zkp
    end

    %% Server Simulators
    subgraph Server Simulators ["Reference Simulators"]
        Wallet["@breakchain/wallet<br/>(Simulated Wallet Server :3002)"]:::backend
        Issuer["@breakchain/issuer<br/>(Simulated Issuer Server :3001)"]:::backend
        DB[(SQLite<br/>Credentials / Logs)]:::db
    end

    %% Data Flow & Protocols
    UI -->|Uses| SDKApi
    SDKApi -->|OIDC4VP (request presentation)| Wallet
    SDKApi -->|verify signature| DID
    SDKApi -->|verify ZK proof| Prover
    SDKApi -->|check status| Revocation
    
    Wallet -->|OIDC4VCI (get credential)| Issuer
    Wallet -->|generates proof| Prover
    Wallet -->|Secure Key Mgmt| Crypto
    Wallet -->|Credential Ops| Credentials

    Issuer -->|reads/writes| DB
    Issuer -->|Credential Ops| Credentials
    Issuer -->|Signing| Crypto
    
    Revocation -->|queries status| Issuer

    Prover -->|loads .wasm & .zkey| Circuits

    %% Shared dependencies mapping
    DID -.-> Core
    Crypto -.-> Core
    Credentials -.-> Core
    Prover -.-> Core
    Revocation -.-> Core
```

### Components of the Final Architecture
1. **Verifier Web App**: The demo frontend built with React/Next.js. It integrates the developer-facing `@breakchain/sdk`.
2. **Breakchain SDK Ecosystem**: The set of fully implemented NPM packages handling DID resolution, VC operations, KeyStore logic, and revocation checks.
3. **ZKP Engine**: Consists of compiled Circom circuits (`@breakchain/circuits`) and the `snarkjs` wrapper (`@breakchain/prover`), which allows local WASM proof generation and verification.
4. **Reference Simulators**:
   *   **Wallet Simulator**: Handles the holder's credential storage, identity, user consent, and proof generation. Interacts via OIDC protocols.
   *   **Issuer Simulator**: Simulates a government/organization issuer. Issues credentials using OpenID4VCI, backed by a SQLite database for managing issued credentials and tracking revocation status.
