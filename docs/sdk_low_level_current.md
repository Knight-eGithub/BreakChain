# SDK Low-Level Architecture (Current State)

This diagram represents the low-level implementation details of the SDK as it currently stands at **Phase 2**, based on the actual codebase. It highlights the internal modules, their responsibilities, and specific implementations (like resolvers and crypto components) that are completed or missing.

```mermaid
graph TD
    %% Define styles
    classDef package fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;
    classDef completed fill:#c8e6c9,stroke:#2e7d32,stroke-width:1px;
    classDef missing fill:#ffccbc,stroke:#d84315,stroke-width:1px,stroke-dasharray: 5 5;
    classDef ext fill:#fafafa,stroke:#9e9e9e,stroke-width:1px;

    %% Packages
    subgraph Core ["@breakchain/core"]
        Types[Shared Types & Constants]:::completed
        Errors[Error Classes]:::completed
    end

    subgraph Crypto ["@breakchain/crypto"]
        Hashing[Hashing Utilities<br/>(SHA-256)]:::completed
        Signing[Ed25519 Signing]:::completed
        JWS[JWS & JWK Helpers]:::completed
        InMemoryKS[InMemory KeyStore]:::completed
        BrowserKS[Browser KeyStore<br/>(IndexedDB + crypto.subtle)]:::missing
    end

    subgraph DID ["@breakchain/did"]
        DIDKey[did:key Resolver<br/>(Deterministic generation)]:::completed
        DIDWeb[did:web Resolver<br/>(HTTPS fetch)]:::completed
        UnifiedRes[Unified Resolver Interface]:::completed
    end

    subgraph Credentials ["@breakchain/credentials"]
        VCBuilder[VC Builder<br/>(Create & Sign)]:::completed
        VPBuilder[VP Builder<br/>(Presentation Generation)]:::completed
        SDJWT[SD-JWT Engine<br/>(Issue & Present SD-JWT)]:::completed
    end

    %% Dependencies and Links
    Crypto -->|depends on| Core
    DID -->|depends on| Core
    DID -->|uses| Crypto
    Credentials -->|depends on| Core
    Credentials -->|uses| Crypto
    Credentials -->|uses| DID

    %% Detailed Connections
    DIDKey -->|generates| JWS
    UnifiedRes --> DIDKey
    UnifiedRes --> DIDWeb
    VCBuilder --> Signing
    VPBuilder --> Signing
    SDJWT --> Hashing

    %% External libs
    ExtCurves[/"@noble/curves"/]:::ext
    ExtHashes[/"@noble/hashes"/]:::ext
    
    Signing -.-> ExtCurves
    Hashing -.-> ExtHashes
```

### Component Details
*   **Core**: Currently holds fundamental definitions such as types and error models. Fully implemented.
*   **Crypto**: Contains essential cryptographic operations. `InMemoryKeyStore` is completed, but `BrowserKeyStore` is currently **missing** in the implementation.
*   **DID**: Supports local `did:key` resolution and network-based `did:web` resolution with a unified interface.
*   **Credentials**: Fully equipped to build and verify JSON-LD VCs, VPs, and SD-JWTs with selective disclosure hashing capabilities.
