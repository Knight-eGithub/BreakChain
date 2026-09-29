# Breakchain SDK: Developer Experience & Ease of Use

The Breakchain SDK is designed to abstract away the terrifying complexity of cryptography and identity standards. It allows developers to build secure, privacy-preserving applications with just a few intuitive function calls. 

This document serves as a guide for explaining the ease of use of the SDK to developers and stakeholders. It contrasts the clean SDK API with the complex operations happening "behind the scenes."

---

## 1. The Identity Layer (Keys & DIDs)

### What the Developer Writes (2 Lines of Code):
```typescript
import { generateEd25519KeyPair } from '@breakchain/crypto';
import { generateDidKey } from '@breakchain/did';

// 1. Generate keys
const issuerKeys = generateEd25519KeyPair();

// 2. Generate a standard Decentralized Identifier (DID)
const issuerDid = generateDidKey(issuerKeys.publicKey); 
// Output: "did:key:z6MkhaXg1NDnv7rq..."
```

### What happens Behind the Scenes:
To developers, this looks like a simple key generator. But behind the scenes, `@breakchain/crypto` is utilizing highly optimized elliptic curve cryptography. When `generateDidKey` is called, the SDK automatically hashes that public key, encodes it in `Base58-btc`, prepends the correct multicodec prefixes, and formats it into a W3C-compliant `did:key` string. A massive amount of cryptographic formatting is abstracted into a single function call.

---

## 2. Credential Issuance

### What the Developer Writes:
```typescript
import { createCredential, signCredential } from '@breakchain/credentials';

// 1. Scaffold the JSON Data
const rawCredential = createCredential({
  types: ['VerifiableCredential', 'UniversityDegree'],
  issuer: issuerDid,
  subject: { id: studentDid, degree: 'B.Tech' }
});

// 2. Cryptographically Sign
const signedVC = signCredential(rawCredential, issuerKeys.privateKey, `${issuerDid}#key-1`);
```

### What happens Behind the Scenes:
A developer just passes in standard JSON data. Behind the scenes, `@breakchain/credentials` does the heavy lifting to enforce W3C web standards. `createCredential` automatically injects the required JSON-LD `@context` arrays and standardizes the schema. When `signCredential` is called, the SDK parses the JSON, normalizes it so the data is consistently ordered, hashes the data using SHA-256, signs that hash with the Ed25519 private key, and seamlessly injects the cryptographic `proof` object back into the JSON structure.

---

## 3. The 1-Line Verification Pipeline

### The Nightmare (Without Breakchain):
```typescript
// ❌ 1. Manually resolve DID over HTTP
// ❌ 2. Parse DID Document for Verification Methods
// ❌ 3. Decode Base58 Public Keys
// ❌ 4. Run JSON-LD Canonicalization
// ❌ 5. Hash & execute Elliptic Curve Signature Math
```

### The Dream (With Breakchain):
```typescript
import { verifyCredential } from '@breakchain/credentials';
import { createResolver } from '@breakchain/did';

// Initialize the universal DID network resolver
const resolver = createResolver();

// ✅ 1 line of code handles the entire pipeline
const { valid, errors } = await verifyCredential(signedVC, resolver);
```

### What happens Behind the Scenes:
This is the most powerful feature of the SDK. To a developer, verifying a credential is one line of code. Behind the scenes, the SDK acts as a massive orchestration engine:
1. It extracts the signature from the payload.
2. It uses the `resolver` to dynamically figure out if it needs to read from memory (for `did:key`) or fetch from the web (for `did:web`). 
3. It pulls the issuer's public key from the DID document.
4. It canonicalizes the incoming credential to ensure it hasn't been tampered with.
5. It runs the complex math to verify the signature. 
If any of those steps fail, it catches the error and simply returns `valid: false`.

---

## 4. Selective Disclosure & Privacy (SD-JWT / ZKP)

### What the Developer Writes:
```typescript
// Developer simply requests a specific claim, the SDK handles the redaction
const presentation = createPresentation({
  credential: signedVC,
  holderKey: studentKeys.privateKey,
  revealClaims: ['degree'] // Automatically hides graduation year and name!
});
```

### What happens Behind the Scenes:
Privacy is usually the hardest part of decentralized identity, normally requiring developers to learn custom Zero-Knowledge languages or handle complex salting mechanisms. With Breakchain, the developer simply passes an array of the fields they want to reveal. The SDK generates cryptographic salts for every single attribute, hashes them individually, and generates a presentation that mathematically proves the hidden data belongs to the signature, without actually revealing the data itself. The developer gets world-class privacy with zero extra cognitive load.

---

## 5. Real-Time Revocation

### What the Developer Writes:
```typescript
// Checking if a university revoked the degree
const isRevoked = await checkRevocationStatus(signedVC.credentialStatus);

if (isRevoked) {
  throw new Error("Credential was revoked by the issuer!");
}
```

### What happens Behind the Scenes:
To a developer, this is just a boolean check. Behind the scenes, the Breakchain SDK reads the `credentialStatus` field, fetches a highly compressed cryptographic bitstring (StatusList2021) from the issuer's server, decompresses it via `gzip`, calculates the exact bit-index assigned to this specific credential, and checks if that bit is flipped to `1` (revoked) or `0` (active). It compresses millions of revocation statuses into kilobytes of data, totally invisible to the developer.

---

## Executive Summary
> **"The Breakchain SDK doesn't just provide cryptographic tools; it provides an architectural shortcut. It takes the 5 hardest problems in Decentralized Identity—Key Generation, JSON-LD Compliance, Network Resolution, Selective Disclosure, and Revocation—and turns them into 5 predictable, strongly-typed JavaScript functions."**
