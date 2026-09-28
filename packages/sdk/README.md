# @breakchain/sdk

Developer-facing SDK for the **Breakchain ZKP Credential Ecosystem**. Enables privacy-preserving identity verification using W3C Verifiable Credentials (VC v2), Decentralized Identifiers (DIDs), and Groth16 Zero-Knowledge Proofs (snarkjs + Circom).

Verify user claims (e.g., `age >= 18`, `nationality == US`) without learning their raw personal data (exact birthdate, name, address).

## Features

- **Zero-Knowledge Proofs**: True Groth16 proofs on the `bn128` elliptic curve with Poseidon hash commitments.
- **Multiple Transport Adapters**:
  - `HttpWalletAdapter`: Connects to HTTP/REST wallet servers.
  - `PostMessageWalletAdapter`: Connects to browser extensions and embedded wallet iframes via `window.postMessage`.
  - `DeepLinkWalletAdapter`: Generates `openid4vp://` URIs for mobile wallet QR codes and deep links.
- **Client & Server Support**:
  - Client-side: Connect wallet and request presentations (`@breakchain/sdk`).
  - Server-side: Independently verify presentations in backend API routes (`@breakchain/sdk/server`).
- **Standardized**: Fully compliant with W3C VC v2, DIF Presentation Exchange v2, and SD-JWT.

---

## Installation

```bash
npm install @breakchain/sdk
```

---

## Client-Side Usage (Frontend)

```typescript
import { BreakchainSDK } from '@breakchain/sdk';

// 1. Initialize SDK
const sdk = new BreakchainSDK({
  walletAdapterType: 'postMessage', // 'postMessage', 'extension', 'deepLink', or 'http'
});

// 2. Connect to user's wallet
await sdk.connectWallet();

// 3. Request proof of claim (e.g. Age >= 21)
const result = await sdk.requestProof({
  claims: [{ field: 'age', condition: '>=21' }],
  mode: 'zkp',
});

if (result.verified) {
  console.log('User is verified to be 21 or older!');
  // Send result.presentation to your backend to grant session
}
```

### Mobile / QR Code Flow (DeepLink Adapter)

```typescript
import { BreakchainSDK, DeepLinkWalletAdapter } from '@breakchain/sdk';

const sdk = new BreakchainSDK({}, {
  adapter: new DeepLinkWalletAdapter({
    responseUri: 'https://api.yourdomain.com/api/verify-callback',
    callbacks: {
      onRequestUri: (uri) => {
        // Render QR code or trigger mobile redirect: openid4vp://...
        displayQrCode(uri);
      },
      waitForResponse: async () => {
        // Poll or listen on WebSocket/SSE for wallet submission
        return await listenForWalletPresentation();
      },
    },
  }),
});
```

---

## Server-Side Verification (Backend API Route)

Never trust the frontend alone. Import `@breakchain/sdk/server` in your Node.js / Next.js / Express backend to independently verify presentations before issuing session tokens:

```typescript
import { verifyPresentation } from '@breakchain/sdk/server';

export async function handleLogin(req, res) {
  const { presentation } = req.body;

  // Cryptographically verify signatures, ZK proof, and revocation status
  const verification = await verifyPresentation(presentation, {
    revocationCheck: true,
  });

  if (!verification.valid) {
    return res.status(401).json({ error: 'Verification failed', details: verification.errors });
  }

  // Issue session cookie / JWT
  res.json({ success: true, message: 'Authenticated' });
}
```

---

## API Reference

### `BreakchainSDK`

- `new BreakchainSDK(config?, options?)`: Create SDK instance.
- `connectWallet()`: Establish connection to the configured wallet.
- `requestProof(options)`: Request a ZK proof or verifiable presentation.
  - `claims`: `ClaimRequest[]` (e.g. `[{ field: 'age', condition: '>=18' }]`)
  - `mode`: `'zkp' | 'sd-jwt' | 'plain'`
  - `circuit?`: Specific circuit ID override
- `verifyPresentation(presentation)`: Validate signatures, proofs, and revocation.
- `disconnect()`: Clean up active wallet session.
- `isConnected()`: Returns boolean connection status.
- `getWalletDid()`: Returns holder's DID.

### `@breakchain/sdk/server`

- `verifyPresentation(presentation, config?)`: Standalone function to verify a VP server-side.
- `createServerVerifier(config?)`: Reusable verification engine.

---

## License

MIT
