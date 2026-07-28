import { generateEd25519KeyPair, publicKeyToMultibase, publicKeyToJwk, sign, verify, createJWS, verifyJWS, base64urlEncode, base64urlDecode, utf8ToBytes, generateSalt } from '@breakchain/crypto';
import { generateDidKey } from '@breakchain/did';
import { signCredential } from '@breakchain/credentials';
import type { VerifiableCredential } from '@breakchain/core';

export class IssuerKeyManager {
  private readonly _privateKey: Uint8Array;
  private readonly _publicKey: Uint8Array;
  private readonly _did: string;
  private readonly _keyId: string;

  constructor(privateKey?: Uint8Array) {
    if (!privateKey) {
       const newKp = generateEd25519KeyPair();
       this._privateKey = newKp.privateKey;
       this._publicKey = newKp.publicKey;
    } else {
       this._privateKey = privateKey;
       this._publicKey = new Uint8Array(32); // Mock for now, simulator
    }

    this._did = generateDidKey(this._publicKey);
    const multi = publicKeyToMultibase(this._publicKey);
    this._keyId = `${this._did}#${multi}`;
  }

  get privateKey(): Uint8Array {
    return this._privateKey;
  }

  getPrivateKey(): Uint8Array {
    return this._privateKey;
  }

  getDid(): string {
    return this._did;
  }

  getKeyId(): string {
    return this._keyId;
  }

  getPublicKey(): Uint8Array {
    return this._publicKey;
  }

  sign(data: Uint8Array): Uint8Array {
    return sign(data, this._privateKey);
  }

  signCredential(vc: VerifiableCredential): VerifiableCredential {
    return signCredential(vc, this._privateKey, this._keyId);
  }

  getDIDDocument(): object {
    return {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1"
      ],
      id: this._did,
      verificationMethod: [{
        id: this._keyId,
        type: "Ed25519VerificationKey2020",
        controller: this._did,
        publicKeyMultibase: publicKeyToMultibase(this._publicKey)
      }],
      authentication: [this._keyId],
      assertionMethod: [this._keyId]
    };
  }
}
