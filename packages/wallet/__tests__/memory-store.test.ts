import { describe, it, expect, beforeEach } from "vitest";

import { InMemoryCredentialStore } from "../src/storage/memory-store";

import type { VerifiableCredential } from "@breakchain/core";

describe("InMemoryCredentialStore", () => {
  let store: InMemoryCredentialStore;

  beforeEach(() => {
    store = new InMemoryCredentialStore();
  });

  const credential: VerifiableCredential = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: "credential-1",
    type: ["VerifiableCredential", "IDCard"],
    issuer: "did:key:issuer",
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: "did:key:holder",
      name: "Prasad"
    }
  };

  it("stores a credential", async () => {
    await store.addCredential(credential);

    const all = await store.getCredentials();

    expect(all.length).toBe(1);
    expect(all[0].id).toBe("credential-1");
  });

  it("gets credential by id", async () => {
    await store.addCredential(credential);

    const vc = await store.getCredential("credential-1");

    expect(vc).not.toBeNull();
    expect(vc?.id).toBe("credential-1");
  });

  it("removes credential", async () => {
    await store.addCredential(credential);

    await store.removeCredential("credential-1");

    const all = await store.getCredentials();

    expect(all.length).toBe(0);
  });

  it("clears store", async () => {
    await store.addCredential(credential);

    await store.clear();

    expect(await store.getCredentials()).toEqual([]);
  });
});