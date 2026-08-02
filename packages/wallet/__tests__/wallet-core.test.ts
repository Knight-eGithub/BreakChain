import { describe, expect, it, beforeEach } from "vitest";

import { WalletCore } from "../src/wallet-core";
import { InMemoryCredentialStore } from "../src/storage/memory-store";

import { InMemoryKeyStore } from "@breakchain/crypto";

import type { VerifiableCredential } from "@breakchain/core";

describe("WalletCore", () => {
  let wallet: WalletCore;

  beforeEach(() => {
    wallet = new WalletCore(
      new InMemoryKeyStore(),
      new InMemoryCredentialStore()
    );
  });

  const credential: VerifiableCredential = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "vc1",
    type: ["VerifiableCredential"],
    issuer: "did:key:issuer",
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: "did:key:holder",
      age: 23
    }
  };

  it("initializes wallet", async () => {
    const did = await wallet.initialize();

    expect(did.startsWith("did:key:")).toBe(true);
  });

  it("stores credentials", async () => {
    await wallet.initialize();

    await wallet.addCredential(credential);

    const credentials =
      await wallet.getCredentials();

    expect(credentials.length).toBe(1);
  });

  it("returns holder DID", async () => {
    const did = await wallet.initialize();

    expect(wallet.getDid()).toBe(did);
  });

  it("finds credential", async () => {
    await wallet.initialize();

    await wallet.addCredential(credential);

    const found =
      await wallet.findCredentials([
        {
          id: "age",

          constraints: {
            fields: [
              {
                path: [
                  "$.credentialSubject.age"
                ],

                filter: {
                  type: "number",
                  minimum: 18
                }
              }
            ]
          }
        }
      ]);

    expect(found.length).toBe(1);
  });
});