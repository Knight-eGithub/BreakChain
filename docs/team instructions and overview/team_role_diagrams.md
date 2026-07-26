# Team Role Diagrams

All diagrams are based on [System Architecture](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/docs/System%20Architecture.md), [Low-Level Architecture](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/docs/ZKP%20Credential%20Ecosystem%20Low-Level%20Architecture.md), and [Implementation Plan](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/docs/implementation_plan.md).

---

## Diagram 1 - Lead: Interaction Flow with Other Roles

How the SDK connects to every other component in the system.

```mermaid
sequenceDiagram
    participant App as Web App<br/>(Verifier)
    participant SDK as Breakchain SDK<br/>(LEAD builds)
    participant Wallet as Wallet Server :3002<br/>(WALLET builds)
    participant Prover as ZK Verifier<br/>(ZKP builds)
    participant Revocation as Revocation Client<br/>(BACKEND builds)
    participant DID as DID Resolver<br/>(Frozen Foundation)

    App->>SDK: sdk.connectWallet()
    SDK->>Wallet: HTTP POST /api/connect
    Wallet-->>SDK: { session, did }

    App->>SDK: sdk.requestProof({ claims, mode })
    SDK->>SDK: PresentationRequestBuilder<br/>ClaimRequest[] to PresentationDefinition
    SDK->>Wallet: POST /api/presentation-request<br/>{ definition, challenge }
    Wallet-->>SDK: { vp_token, proof_type }

    SDK->>DID: resolver.resolve(holderDid)
    DID-->>SDK: DID Document + public key
    SDK->>SDK: Verify holder VP signature (JWS)

    SDK->>DID: resolver.resolve(issuerDid)
    DID-->>SDK: DID Document + public key
    SDK->>SDK: Verify issuer VC signature (JWS)

    SDK->>Prover: ZKVerifier.verify(proof, publicSignals)
    Prover-->>SDK: true/false

    SDK->>Revocation: checkStatus(credentialId)
    Revocation-->>SDK: { revoked: false }

    SDK-->>App: VerificationResult { valid, claims }
```

---

## Diagram 2 - Lead: What You Build (SDK Internals)

```mermaid
graph TB
    subgraph SDK["@breakchain/sdk"]
        direction TB
        
        CipheraSDK["CipheraSDK<br/>- connectWallet()<br/>- requestProof()<br/>- verifyPresentation()<br/>- disconnect()"]
        
        subgraph Connectors["Wallet Connection Layer"]
            WalletAdapter["WalletAdapter Interface"]
            HttpAdapter["HttpWalletAdapter<br/>HTTP to :3002"]
            BrowserAdapter["BrowserExtensionAdapter<br/>(future)"]
            WalletAdapter --> HttpAdapter
            WalletAdapter --> BrowserAdapter
        end
        
        subgraph RequestLayer["Request Building"]
            PRB["PresentationRequestBuilder<br/>ClaimRequest[] to<br/>DIF PresentationDefinition"]
        end
        
        subgraph Orchestration["Proof Orchestration"]
            PO["ProofOrchestrator<br/>1. Build definition<br/>2. Send to wallet<br/>3. Receive VP<br/>4. Verify all layers<br/>5. Extract claims<br/>6. Return result"]
        end
        
        subgraph Verification["Verification Engine"]
            VE["VerificationEngine"]
            HolderV["Holder VP Signature<br/>(via DID resolver)"]
            IssuerV["Issuer VC Signature<br/>(via DID resolver)"]
            ZKV["ZK Proof Verification<br/>(via ZKVerifier)"]
            RevV["Revocation Check<br/>(via RevocationClient)"]
            VE --> HolderV
            VE --> IssuerV
            VE --> ZKV
            VE --> RevV
        end
        
        CipheraSDK --> Connectors
        CipheraSDK --> RequestLayer
        CipheraSDK --> Orchestration
        CipheraSDK --> Verification
    end

    subgraph Frozen["Frozen Foundation (imports)"]
        core["@breakchain/core<br/>types, errors"]
        did["@breakchain/did<br/>DIDResolver"]
    end

    subgraph TeamDeps["Team Dependencies (imports)"]
        prover["@breakchain/prover<br/>ZKVerifier"]
        revocation["@breakchain/revocation<br/>RevocationClient"]
    end

    SDK -.-> Frozen
    ZKV -.-> prover
    RevV -.-> revocation

    style SDK fill:#f5a623,stroke:#d4891a,color:#000
    style Frozen fill:#4a5568,stroke:#2d3748,color:#fff
    style TeamDeps fill:#e2e8f0,stroke:#a0aec0,color:#000
```

---

## Diagram 3 - ZKP Engineer: Interaction Flow with Other Roles

How the circuits and prover connect into the ecosystem.

```mermaid
sequenceDiagram
    participant Wallet as Wallet<br/>(WALLET builds)
    participant WG as WitnessGenerator<br/>(ZKP builds)
    participant CS as CircuitSelector<br/>(ZKP builds)
    participant Prover as ZKProver<br/>(ZKP builds)
    participant Circuit as Circuit WASM<br/>(ZKP builds)
    participant SDK as SDK VerificationEngine<br/>(LEAD builds)
    participant Verifier as ZKVerifier<br/>(ZKP builds)

    Note over Wallet: Receives PresentationDefinition<br/>with claim: { field: "age", condition: ">=18" }

    Wallet->>CS: selectCircuit(claims)
    CS-->>Wallet: { circuitName: "ageOver", inputMapping }

    Wallet->>WG: generateInputs(credential.claims, "ageOver", salt)
    WG->>WG: Poseidon hash(age, salt) for commitment
    WG-->>Wallet: { age: 25n, salt: 123n, ageHash: 456n, threshold: 18n }

    Wallet->>Prover: generateProof(inputs)
    Prover->>Circuit: snarkjs.groth16.fullProve(inputs, wasm, zkey)
    Circuit-->>Prover: { proof: { pi_a, pi_b, pi_c }, publicSignals }
    Prover-->>Wallet: ZK Proof + public signals

    Note over Wallet: Embeds proof in VP, sends to SDK

    SDK->>Verifier: verify(proof, publicSignals)
    Verifier->>Verifier: snarkjs.groth16.verify(vKey, signals, proof)
    Verifier-->>SDK: true
```

---

## Diagram 4 - ZKP Engineer: What You Build (Circuits + Prover Internals)

```mermaid
graph TB
    subgraph Circuits["@breakchain/circuits"]
        direction TB
        
        subgraph CircomSource["Circom Source Files"]
            AgeOver["ageOver.circom<br/>- Poseidon(age, salt) == ageHash<br/>- age >= threshold<br/>- Range check via signal constraints"]
            NatCheck["nationalityCheck.circom<br/>- Poseidon(nationality, salt) == hash<br/>- hash == expectedHash"]
            CredOwn["credentialOwnership.circom<br/>- Poseidon(didSecret, credHash)<br/>  == ownershipHash"]
        end
        
        subgraph BuildPipeline["Build Pipeline"]
            Compile["circom compile<br/>--r1cs --wasm --sym"]
            Setup["Trusted Setup<br/>Powers-of-Tau + Groth16"]
        end
        
        subgraph Artifacts["Pre-built Artifacts (committed to repo)"]
            WASM[".wasm files<br/>(circuit executables)"]
            ZKEY[".zkey files<br/>(proving keys)"]
            VKEY["verification_key.json<br/>(public verification keys)"]
        end
        
        CircomSource --> Compile
        Compile --> Setup
        Setup --> Artifacts
    end
    
    subgraph ProverPkg["@breakchain/prover"]
        direction TB
        
        ZKProver["ZKProver<br/>- constructor(wasm, zkey)<br/>- generateProof(inputs)<br/>  wraps snarkjs.groth16.fullProve()"]
        
        ZKVerifier["ZKVerifier<br/>- constructor(verificationKey)<br/>- verify(proof, publicSignals)<br/>  wraps snarkjs.groth16.verify()"]
        
        CircuitSelector["CircuitSelector<br/>- selectCircuit(ClaimRequest[])<br/>  maps claim conditions<br/>  to circuit name + input mapping"]
        
        WitnessGen["WitnessGenerator<br/>- generateInputs(claims, circuit, salt)<br/>  converts credential values<br/>  to circuit bigint signals<br/>  applies Poseidon hashing"]
    end
    
    Artifacts --> ZKProver
    Artifacts --> ZKVerifier
    
    subgraph Imports["Imports from Foundation"]
        core["@breakchain/core<br/>ZKProof, ClaimRequest,<br/>CircuitArtifact types"]
    end
    
    ProverPkg -.-> Imports
    Circuits -.-> Imports

    style Circuits fill:#48bb78,stroke:#2f855a,color:#000
    style ProverPkg fill:#48bb78,stroke:#2f855a,color:#000
    style Imports fill:#4a5568,stroke:#2d3748,color:#fff
```

---

## Diagram 5 - Backend Engineer: Interaction Flow with Other Roles

The issuer's OpenID4VCI flow and revocation checks.

```mermaid
sequenceDiagram
    participant Wallet as Wallet<br/>(WALLET builds)
    participant Issuer as Issuer Server :3001<br/>(BACKEND builds)
    participant DB as SQLite<br/>(BACKEND builds)
    participant SDK as SDK<br/>(LEAD builds)
    participant RevClient as RevocationClient<br/>(BACKEND builds)

    Note over Wallet,Issuer: Credential Issuance Flow (OpenID4VCI)

    Wallet->>Issuer: POST /api/credential-offer { type: "IDCard" }
    Issuer->>DB: Store pre-authorized code
    Issuer-->>Wallet: { offer_url, pre_authorized_code }

    Wallet->>Issuer: POST /api/token { pre_authorized_code }
    Issuer->>DB: Validate code, generate access_token + c_nonce
    Issuer-->>Wallet: { access_token, c_nonce }

    Wallet->>Issuer: POST /api/credential<br/>Bearer: access_token<br/>{ format, proof: JWS(c_nonce) }
    Issuer->>Issuer: Validate bearer token
    Issuer->>Issuer: Verify proof-of-possession (holder JWS)
    Issuer->>Issuer: Build VC (createCredential + signCredential)
    Issuer->>DB: Store credential metadata (id, holder, status)
    Issuer-->>Wallet: { format: "ldp_vc", credential, c_nonce }

    Note over SDK,Issuer: Revocation Check Flow

    SDK->>RevClient: checkStatus(credentialId)
    RevClient->>Issuer: GET /api/status?id=cred123
    Issuer->>DB: SELECT status WHERE id = cred123
    Issuer-->>RevClient: { revoked: false }
    RevClient-->>SDK: { revoked: false }

    Note over Issuer: Admin Revocation

    Issuer->>Issuer: POST /api/revoke { credentialId }
    Issuer->>DB: UPDATE status = 'revoked'
```

---

## Diagram 6 - Backend Engineer: What You Build (Issuer + Revocation Internals)

```mermaid
graph TB
    subgraph IssuerPkg["@breakchain/issuer"]
        direction TB
        
        Server["Express Server :3001<br/>cors, json middleware"]
        
        subgraph Discovery["Discovery Endpoints"]
            WKIssuer["GET /.well-known/openid-credential-issuer<br/>supported types, formats, endpoints"]
            WKOAuth["GET /.well-known/oauth-authorization-server<br/>token endpoint, grant types"]
            WKDID["GET /.well-known/did.json<br/>Issuer DID Document (did:web)"]
        end
        
        subgraph TokenFlow["Token Flow"]
            Offer["POST /api/credential-offer<br/>Creates offer + pre-auth code"]
            Token["POST /api/token<br/>Exchanges code for<br/>access_token + c_nonce"]
        end
        
        subgraph Issuance["Credential Issuance"]
            CredEndpoint["POST /api/credential<br/>1. Validate bearer<br/>2. Verify PoP (JWS over c_nonce)<br/>3. Build VC via createCredential()<br/>4. Sign via signCredential()<br/>5. Return signed VC"]
        end
        
        subgraph KeyMgmt["Issuer Key Management"]
            KeyGen["On startup:<br/>generateEd25519KeyPair()<br/>generateDidKey(publicKey)"]
        end
        
        subgraph Database["SQLite Database"]
            CredTable["credentials table<br/>id, holder_did, type,<br/>status, status_index, issued_at"]
            TokenTable["tokens table<br/>code, access_token, c_nonce,<br/>holder_did, credential_type"]
        end
        
        Server --> Discovery
        Server --> TokenFlow
        Server --> Issuance
        Server --> KeyMgmt
        Issuance --> Database
        TokenFlow --> Database
    end
    
    subgraph RevPkg["@breakchain/revocation"]
        direction TB
        
        subgraph RevEndpoints["Issuer Revocation Endpoints"]
            StatusGet["GET /api/status?id=credId<br/>Returns { revoked: boolean }"]
            RevokePost["POST /api/revoke<br/>Marks credential revoked"]
            StatusList["GET /api/status-list<br/>Signed StatusList2021 VC"]
        end
        
        subgraph RevClient["Client Library"]
            RC["RevocationClient<br/>- constructor(issuerUrl)<br/>- checkStatus(credentialId)<br/>- checkStatusList(credential)"]
            SLG["StatusListGenerator<br/>- generateStatusList()<br/>  compressed bitstring VC"]
        end
    end
    
    subgraph Imports["Foundation Imports"]
        core["@breakchain/core"]
        crypto["@breakchain/crypto<br/>generateEd25519KeyPair, sign,<br/>createJWS, verifyJWS"]
        did["@breakchain/did<br/>generateDidKey"]
        creds["@breakchain/credentials<br/>createCredential, signCredential,<br/>issueSDJWT"]
    end
    
    IssuerPkg -.-> Imports
    RevPkg -.-> core

    style IssuerPkg fill:#4299e1,stroke:#2b6cb0,color:#000
    style RevPkg fill:#4299e1,stroke:#2b6cb0,color:#000
    style Imports fill:#4a5568,stroke:#2d3748,color:#fff
```

---

## Diagram 7 - Wallet Engineer: Interaction Flow with Other Roles

The wallet's full lifecycle - receiving credentials and presenting proofs.

```mermaid
sequenceDiagram
    participant Issuer as Issuer :3001<br/>(BACKEND builds)
    participant WalletServer as Wallet Server :3002<br/>(WALLET builds)
    participant WalletCore as WalletCore<br/>(WALLET builds)
    participant KeyStore as KeyStore<br/>(Frozen Foundation)
    participant Creds as @breakchain/credentials<br/>(Frozen Foundation)
    participant Prover as ZKProver<br/>(ZKP builds)
    participant SDK as SDK<br/>(LEAD builds)

    Note over WalletServer: Initialization
    WalletCore->>KeyStore: generateKeyPair("Ed25519")
    KeyStore-->>WalletCore: { did, publicKey }

    Note over Issuer,WalletServer: Credential Reception
    SDK->>WalletServer: POST /api/receive-offer { offer_url }
    WalletServer->>Issuer: GET /.well-known/openid-credential-issuer
    Issuer-->>WalletServer: metadata
    WalletServer->>Issuer: POST /api/token { pre_authorized_code }
    Issuer-->>WalletServer: { access_token, c_nonce }
    WalletServer->>KeyStore: sign(did, c_nonce)
    KeyStore-->>WalletServer: JWS proof-of-possession
    WalletServer->>Issuer: POST /api/credential { proof }
    Issuer-->>WalletServer: { credential: signed VC }
    WalletServer->>Creds: verifyCredential(vc, resolver)
    Creds-->>WalletServer: { valid: true }
    WalletServer->>WalletCore: addCredential(vc)

    Note over SDK,WalletServer: Presentation with ZK Proof
    SDK->>WalletServer: POST /api/presentation-request<br/>{ definition, challenge }
    WalletServer->>WalletCore: findCredentials(inputDescriptors)
    WalletCore-->>WalletServer: matching VCs
    WalletServer->>Prover: generateProof(circuitInputs)
    Prover-->>WalletServer: { proof, publicSignals }
    WalletServer->>Creds: createPresentation + signPresentation
    Creds-->>WalletServer: signed VP with ZK proof
    WalletServer-->>SDK: { vp_token, proof_type: "zkp" }
```

---

## Diagram 8 - Wallet Engineer: What You Build (Wallet Internals)

```mermaid
graph TB
    subgraph WalletPkg["@breakchain/wallet"]
        direction TB
        
        WalletHTTP["Wallet HTTP Server :3002<br/>Express + cors"]
        
        subgraph Routes["API Routes"]
            ReceiveOffer["POST /api/receive-offer<br/>Accept credential offer URL"]
            ListCreds["GET /api/credentials<br/>List stored credentials"]
            PresReq["POST /api/presentation-request<br/>Receive definition, return VP"]
        end
        
        subgraph Core["WalletCore"]
            Init["initialize()<br/>Generate DID via KeyStore"]
            GetDid["getDid()<br/>Return current did:key"]
            AddCred["addCredential(vc)<br/>Verify issuer signature<br/>then store"]
            GetCreds["getCredentials()<br/>List all stored VCs"]
            FindCreds["findCredentials(filter)<br/>Match InputDescriptors"]
        end
        
        subgraph Storage["Credential Storage (Adapter Pattern)"]
            StoreInterface["CredentialStore Interface"]
            MemStore["InMemoryCredentialStore<br/>Map-based, for testing"]
            IDBStore["IndexedDBCredentialStore<br/>Browser persistence"]
            StoreInterface --> MemStore
            StoreInterface --> IDBStore
        end
        
        subgraph IssuanceClient["IssuanceClient"]
            ParseOffer["1. Parse credential offer URL"]
            FetchMeta["2. Fetch issuer metadata"]
            TokenExchange["3. POST /api/token (pre-auth code)"]
            CreatePoP["4. Create proof-of-possession<br/>   JWS over c_nonce with holder key"]
            RequestCred["5. POST /api/credential"]
            StoreCred["6. Store received VC"]
        end
        
        subgraph PresentationEngine["PresentationEngine"]
            ReceiveDef["Receive PresentationDefinition"]
            FindMatch["Find matching credentials"]
            ModeSwitch{"Proof Mode?"}
            ZKPMode["ZKP Mode<br/>Extract private inputs<br/>Select circuit (CircuitSelector)<br/>Generate proof (ZKProver)"]
            SDJWTMode["SD-JWT Mode<br/>presentSDJWT(token, fields)"]
            PlainMode["Plain VP Mode<br/>createPresentation()<br/>signPresentation()"]
            ReturnVP["Return { vp_token, proof_type }"]
            
            ReceiveDef --> FindMatch
            FindMatch --> ModeSwitch
            ModeSwitch -->|zkp| ZKPMode
            ModeSwitch -->|sd-jwt| SDJWTMode
            ModeSwitch -->|plain| PlainMode
            ZKPMode --> ReturnVP
            SDJWTMode --> ReturnVP
            PlainMode --> ReturnVP
        end
        
        WalletHTTP --> Routes
        Routes --> Core
        Routes --> IssuanceClient
        Routes --> PresentationEngine
        Core --> Storage
    end
    
    subgraph BrowserKS["Also builds in @breakchain/crypto"]
        BKS["BrowserKeyStore<br/>- crypto.subtle.generateKey(Ed25519)<br/>- Non-extractable CryptoKeys<br/>- IndexedDB persistence<br/>- crypto.subtle.sign() for signing"]
    end
    
    subgraph Imports["Foundation Imports"]
        core["@breakchain/core"]
        crypto["@breakchain/crypto<br/>InMemoryKeyStore, createJWS"]
        did["@breakchain/did<br/>generateDidKey, createResolver"]
        creds["@breakchain/credentials<br/>verifyCredential, createPresentation,<br/>signPresentation, presentSDJWT"]
    end
    
    subgraph TeamDeps["Team Dependencies"]
        prover["@breakchain/prover<br/>ZKProver, CircuitSelector,<br/>WitnessGenerator"]
    end
    
    WalletPkg -.-> Imports
    ZKPMode -.-> prover
    BrowserKS -.-> crypto

    style WalletPkg fill:#ecc94b,stroke:#d69e2e,color:#000
    style BrowserKS fill:#ecc94b,stroke:#d69e2e,color:#000
    style Imports fill:#4a5568,stroke:#2d3748,color:#fff
    style TeamDeps fill:#e2e8f0,stroke:#a0aec0,color:#000
```

---

## Diagram 9 - Full Team Timeline

```mermaid
graph LR
    subgraph Foundation["FOUNDATION (Complete)"]
        direction TB
        P1["Phase 1<br/>Core + Crypto<br/>10 tests"]
        P2["Phase 2<br/>DID + Key Mgmt<br/>18 tests"]
        P3["Phase 3<br/>Credentials + SD-JWT<br/>25 tests"]
        P1 --> P2 --> P3
    end

    subgraph ParallelBuild["PARALLEL BUILD (All 4 devs)"]
        direction TB
        
        subgraph TrackLead["LEAD Track"]
            direction TB
            SDK1["Week 1: SDK Foundation<br/>CipheraSDK class<br/>HttpWalletAdapter<br/>PresentationRequestBuilder<br/>ProofOrchestrator"]
            SDK2["Week 2: Verification<br/>VerificationEngine<br/>Integrate prover + revocation<br/>Review team PRs"]
            SDK1 --> SDK2
        end
        
        subgraph TrackZKP["ZKP Track"]
            direction TB
            ZKP1["Week 1: Circuits<br/>ageOver.circom<br/>nationalityCheck.circom<br/>credentialOwnership.circom<br/>Compile + Trusted Setup"]
            ZKP2["Week 2: Prover<br/>ZKProver + ZKVerifier<br/>CircuitSelector<br/>WitnessGenerator<br/>Unit tests + MERGE"]
            ZKP1 --> ZKP2
        end
        
        subgraph TrackBackend["BACKEND Track"]
            direction TB
            BE1["Week 1: Issuer<br/>Express :3001<br/>Discovery endpoints<br/>Token flow<br/>Credential issuance + SQLite"]
            BE2["Week 2: Revocation<br/>Status endpoints<br/>StatusList2021<br/>RevocationClient + MERGE"]
            BE1 --> BE2
        end
        
        subgraph TrackWallet["WALLET Track"]
            direction TB
            WL1["Week 1: Wallet Core<br/>WalletCore class<br/>Credential storage<br/>BrowserKeyStore"]
            WL2["Week 2: Issuance + Presentation<br/>IssuanceClient<br/>PresentationEngine<br/>Wallet server :3002 + MERGE"]
            WL1 --> WL2
        end
    end

    subgraph Convergence["CONVERGENCE (All 4 devs)"]
        direction TB
        INT["Week 3: Integration<br/>SDK + Wallet + Issuer wired<br/>Full E2E testing"]
        DEMO["Week 3: Demo App<br/>Vite + React :3000<br/>Issue + Verify + Revoke pages"]
        HARD["Week 4: Hardening<br/>Security review<br/>Docs + npm publish"]
        INT --> DEMO --> HARD
    end

    P3 --> TrackLead
    P3 --> TrackZKP
    P3 --> TrackBackend
    P3 --> TrackWallet

    SDK2 --> INT
    ZKP2 --> INT
    BE2 --> INT
    WL2 --> INT

    style Foundation fill:#4a5568,stroke:#2d3748,color:#fff
    style TrackLead fill:#f5a623,stroke:#d4891a,color:#000
    style TrackZKP fill:#48bb78,stroke:#2f855a,color:#000
    style TrackBackend fill:#4299e1,stroke:#2b6cb0,color:#000
    style TrackWallet fill:#ecc94b,stroke:#d69e2e,color:#000
    style Convergence fill:#9f7aea,stroke:#6b46c1,color:#fff
```
