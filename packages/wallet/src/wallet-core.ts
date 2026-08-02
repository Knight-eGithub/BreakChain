import type { KeyStore } from "@breakchain/crypto";
import type {
  VerifiableCredential,
  InputDescriptor,
} from "@breakchain/core";

import type { CredentialStore } from "./storage/credential-store";

export class WalletCore {
  private did: string | null = null;

  constructor(
    private readonly keyStore: KeyStore,
    private readonly credentialStore: CredentialStore
  ) {}

  /**
   * Generate a holder DID using the KeyStore.
   */
  async initialize(): Promise<string> {
    if (this.did) {
      return this.did;
    }

    const { id } = await this.keyStore.generateKeyPair();

    this.did = id;

    return this.did;
  }

  /**
   * Return the holder DID.
   */
  getDid(): string {
    if (!this.did) {
      throw new Error("Wallet has not been initialized.");
    }

    return this.did;
  }

  /**
   * Store a credential.
   *
   * NOTE:
   * Signature verification should be added later using
   * @breakchain/credentials once that package is ready.
   */
  async addCredential(
    credential: VerifiableCredential
  ): Promise<void> {
    if (!credential.id) {
      throw new Error("Credential must contain an id.");
    }

    await this.credentialStore.addCredential(credential);
  }

  /**
   * Return every stored credential.
   */
  async getCredentials(): Promise<VerifiableCredential[]> {
    return this.credentialStore.getCredentials();
  }

  /**
   * Find credentials matching a Presentation Exchange
   * InputDescriptor list.
   */
  async findCredentials(
    descriptors: InputDescriptor[]
  ): Promise<VerifiableCredential[]> {
    const credentials = await this.getCredentials();

    return credentials.filter((credential) =>
      descriptors.every((descriptor) =>
        this.matchesDescriptor(credential, descriptor)
      )
    );
  }

  /**
   * Check whether one credential satisfies
   * a Presentation Exchange InputDescriptor.
   */
  private matchesDescriptor(
    credential: VerifiableCredential,
    descriptor: InputDescriptor
  ): boolean {
    if (!descriptor.constraints?.fields?.length) {
      return true;
    }

    return descriptor.constraints.fields.every((field) =>
      this.matchesField(credential, field.path, field.filter)
    );
  }

  /**
   * Evaluate a single field constraint.
   */
  private matchesField(
    credential: VerifiableCredential,
    paths: string[],
    filter?: {
      type: string;
      const?: unknown;
      minimum?: number;
      maximum?: number;
      pattern?: string;
    }
  ): boolean {
    if (!filter) {
      return true;
    }

    for (const path of paths) {
      const value = this.resolvePath(credential, path);

      if (value === undefined) {
        continue;
      }

      if (filter.const !== undefined && value !== filter.const) {
        continue;
      }

      if (
        typeof value === "number" &&
        filter.minimum !== undefined &&
        value < filter.minimum
      ) {
        continue;
      }

      if (
        typeof value === "number" &&
        filter.maximum !== undefined &&
        value > filter.maximum
      ) {
        continue;
      }

      if (
        typeof value === "string" &&
        filter.pattern &&
        !new RegExp(filter.pattern).test(value)
      ) {
        continue;
      }

      return true;
    }

    return false;
  }

  /**
   * Resolve a JSONPath-like property.
   *
   * Example:
   * $.credentialSubject.age
   */
  private resolvePath(
    obj: unknown,
    jsonPath: string
  ): unknown {
    const parts = jsonPath
      .replace(/^\$\./, "")
      .split(".");

    let current: any = obj;

    for (const part of parts) {
      if (current == null) {
        return undefined;
      }

      current = current[part];
    }

    return current;
  }
}