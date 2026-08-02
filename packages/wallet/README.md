# @breakchain/wallet

Reference Holder Wallet implementation for the BreakChain ZKP SDK.

The wallet is responsible for:

- Managing the holder's DID and cryptographic keys
- Securely storing Verifiable Credentials (VCs)
- Processing OpenID4VCI credential offers
- Creating Verifiable Presentations (VPs)
- Supporting future SD-JWT and Zero-Knowledge Proof (ZKP) presentations

---

## Features

- Holder DID initialization
- Credential storage abstraction
- In-memory credential storage
- IndexedDB storage (browser support)
- OpenID4VCI issuance client
- Presentation generation
- Express HTTP API
- TypeScript support
- Unit tested with Vitest

---

## Project Structure

```
wallet/
│
├── src/
│   ├── index.ts
│   ├── wallet-core.ts
│   ├── issuance-client.ts
│   ├── presentation-engine.ts
│   ├── server.ts
│   │
│   └── storage/
│       ├── credential-store.ts
│       ├── memory-store.ts
│       └── indexeddb-store.ts
│
├── __tests__/
│   ├── memory-store.test.ts
│   └── wallet-core.test.ts
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Installation

From the repository root:

```bash
npm install
```

Build the wallet package:

```bash
npm run build --workspace=@breakchain/wallet
```

Or from inside the package:

```bash
npm run build
```

---

## Running Tests

Run all wallet tests:

```bash
npm test --workspace=@breakchain/wallet
```

or

```bash
npm test
```

---

## Components

### WalletCore

Main wallet implementation responsible for:

- Holder DID initialization
- Credential management
- Credential lookup
- Wallet lifecycle

Methods

- `initialize()`
- `getDid()`
- `addCredential()`
- `getCredentials()`
- `findCredentials()`

---

### Credential Storage

The wallet uses the Adapter Pattern for storage.

Current implementations:

- InMemoryCredentialStore
- IndexedDBCredentialStore

This allows switching storage implementations without modifying WalletCore.

---

### Issuance Client

Implements the wallet side of the OpenID4VCI credential issuance flow.

Responsibilities:

- Parse credential offers
- Retrieve issuer metadata
- Exchange pre-authorized code
- Generate proof-of-possession
- Request credentials
- Store received credentials

---

### Presentation Engine

Creates Verifiable Presentations from stored credentials.

Supported modes:

- Plain Presentation
- SD-JWT (placeholder)
- ZKP (mock implementation)

---

### HTTP Server

Runs an Express server exposing wallet functionality.

Default URL

```
http://localhost:3002
```

---

## API Endpoints

### Receive Credential Offer

```
POST /api/receive-offer
```

Request

```json
{
  "offerUrl": "https://issuer.example.com?credential_offer=..."
}
```

---

### List Credentials

```
GET /api/credentials
```

Returns all stored Verifiable Credentials.

---

### Create Presentation

```
POST /api/presentation-request
```

Example Request

```json
{
  "definition": {
    "id": "presentation-definition",
    "input_descriptors": []
  },
  "challenge": "123456",
  "mode": "plain"
}
```

Supported modes:

- plain
- sd-jwt
- zkp

---

## Testing

Current test coverage includes:

- Credential storage
- Wallet initialization
- Credential management
- Credential lookup

Example output

```
✓ memory-store.test.ts
✓ wallet-core.test.ts

Test Files 2 passed
Tests 8 passed
```

---

## Current Status

Implemented

- Wallet Core
- Credential Storage
- In-Memory Store
- IndexedDB Store
- Issuance Client
- Presentation Engine
- HTTP Server
- Package Exports
- Unit Tests

Planned

- BrowserKeyStore
- Real JWS proof generation
- SD-JWT integration
- ZKP prover integration
- Demo application

---

## Development

Build

```bash
npm run build
```

Run tests

```bash
npm test
```

Start wallet server

```bash
npm start
```

---

## Dependencies

- @breakchain/core
- @breakchain/crypto
- @breakchain/did
- @breakchain/credentials
- Express
- CORS
- TypeScript
- Vitest

---

## License

MIT