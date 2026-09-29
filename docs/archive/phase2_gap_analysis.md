# Phase 2 — Gap Analysis

Comparing the [implementation plan Phase 2](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/docs/implementation_plan.md#L79-L128) requirements against what actually exists in the code.

## Test Results

```
✓ src/__tests__/did.test.ts (18 tests) 38ms — ALL PASSED
```

---

## 2.1 DID Resolvers — `@breakchain/did`

### `did:key` resolver

| Requirement | Status | Where |
|---|---|---|
| `generateDidKey(publicKey) → string` | ✅ Done | [did-key.ts:27](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-key.ts#L27) |
| `resolveDidKey(did) → DIDDocument` with `verificationMethod` + `authentication` | ✅ Done | [did-key.ts:56](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-key.ts#L56) |
| No network calls — fully self-contained | ✅ Done | Purely deterministic, derives doc from the DID string itself |
| Returns both `publicKeyMultibase` and `publicKeyJwk` in verificationMethod | ✅ Done | [did-key.ts:61-67](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-key.ts#L61-L67) — provides both formats |
| Sets `authentication` and `assertionMethod` | ✅ Done | [did-key.ts:73-74](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-key.ts#L73-L74) |
| Full resolution result wrapper (`DIDResolutionResult`) | ✅ Done | [did-key.ts:84](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-key.ts#L84) — `resolveDidKeyFull()` with error handling |

**Extra (not in plan):** `didKeyToPublicKey()` — extracts the raw public key back from a `did:key` string. Useful utility.

---

### `did:web` resolver

| Requirement | Status | Where |
|---|---|---|
| `resolveDidWeb(did) → DIDDocument` via HTTPS fetch | ✅ Done | [did-web.ts:49](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-web.ts#L49) |
| Transform `did:web:example.com` → `https://example.com/.well-known/did.json` | ✅ Done | [did-web.ts:31-33](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-web.ts#L31-L33) |
| Handle subpaths: `did:web:example.com:path:to` → `https://example.com/path/to/did.json` | ✅ Done | [did-web.ts:37-38](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-web.ts#L37-L38) |
| Handle URL-encoded ports: `example.com%3A3001` | ✅ Done | [did-web.ts:29](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-web.ts#L29) — `decodeURIComponent()` |
| Validates DID Document `id` matches the DID | ✅ Done | [did-web.ts:63-66](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-web.ts#L63-L66) |
| Full resolution result wrapper | ✅ Done | [did-web.ts:78](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/did-web.ts#L78) — `resolveDidWebFull()` |

---

### Unified resolver interface

| Requirement | Status | Where |
|---|---|---|
| `DIDResolver` interface with `resolve(did) → DIDDocument` | ✅ Done | [resolver.ts:14-21](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/resolver.ts#L14-L21) |
| `extractPublicKey(didDoc) → Uint8Array` | ✅ Done | [resolver.ts:44](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/resolver.ts#L44) — `extractPublicKeyFromDoc()` supports both multibase and JWK formats |
| Auto-detect method and delegate | ✅ Done | [resolver.ts:30-33](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/resolver.ts#L30-L33) — `detectMethod()` + switch in `resolve()`/`resolveFull()` |
| Factory function `createResolver()` | ✅ Done | [resolver.ts:72](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/did/src/resolver.ts#L72) |

---

## 2.2 Key Store Abstraction

| Requirement | Status | Where |
|---|---|---|
| `KeyStore` interface | ✅ Done (Phase 1) | [key-store.ts:4-11](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/crypto/src/key-store.ts#L4-L11) |
| `InMemoryKeyStore` | ✅ Done (Phase 1) | [key-store.ts:13-47](file:///c:/Users/ASUS/Documents/files/projects/sdk-zkp/packages/crypto/src/key-store.ts#L13-L47) |
| **`BrowserKeyStore`** — wraps `crypto.subtle` + `IndexedDB` | ❌ **Missing** | Not implemented |
| Private keys never exposed outside KeyStore | ✅ Done | No `getPrivateKey()` method exists |

---

## Phase 2 Deliverables Checklist

| Deliverable | Status |
|---|---|
| `@breakchain/did` with both resolvers | ✅ Done |
| Unit tested with sample DIDs | ✅ 18 tests, all passing |
| `KeyStore` abstraction with in-memory implementation | ✅ Done (Phase 1) |
| `KeyStore` with browser implementation | ❌ **Missing** |
| Integration test: generate `did:key` → resolve → verify public key matches | ✅ Done | 

---

## Summary

> [!IMPORTANT]  
> Phase 2 is **~90% complete**. The only missing piece is the **`BrowserKeyStore`** — a `KeyStore` implementation that uses `crypto.subtle` for non-extractable keys and `IndexedDB` for persistence. Everything else is implemented, tested, and passing.

### What's missing in detail

**`BrowserKeyStore`** would need to:
1. Use `crypto.subtle.generateKey('Ed25519', false, ['sign'])` — the `false` flag makes the `CryptoKey` non-extractable (private key can never be exported from the browser)
2. Store the `CryptoKey` objects in IndexedDB (they're structured-cloneable)
3. Sign via `crypto.subtle.sign('Ed25519', privateKey, data)` 
4. Export the public key via `crypto.subtle.exportKey('raw', publicKey)` for DID generation

> [!NOTE]
> The `BrowserKeyStore` is primarily needed for the wallet simulator (Phase 5) and the demo app (Phase 8). It's not blocking Phase 3 (Credential Models & SD-JWT). You could proceed to Phase 3 now and circle back to `BrowserKeyStore` later.
