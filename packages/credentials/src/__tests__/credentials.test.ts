import { describe, it, expect } from 'vitest';
import { generateEd25519KeyPair, publicKeyToMultibase } from '@breakchain/crypto';
import { generateDidKey, createResolver } from '@breakchain/did';
import { createCredential, signCredential, verifyCredentialSignature, verifyCredential } from '../vc-builder';
import { createPresentation, signPresentation, verifyPresentationSignature, verifyPresentation } from '../vp-builder';
import { createDisclosure, hashDisclosure, issueSDJWT, presentSDJWT, verifySDJWT } from '../sd-jwt';

const issuerKeys = generateEd25519KeyPair();
const issuerDid = generateDidKey(issuerKeys.publicKey);
const issuerKeyId = `${issuerDid}#${publicKeyToMultibase(issuerKeys.publicKey)}`;

const holderKeys = generateEd25519KeyPair();
const holderDid = generateDidKey(holderKeys.publicKey);
const holderKeyId = `${holderDid}#${publicKeyToMultibase(holderKeys.publicKey)}`;

const resolver = createResolver();

describe('Verifiable Credentials', () => {
  it('creates a valid VC', () => {
    const vc = createCredential({
      issuer: issuerDid,
      subject: { id: holderDid, name: 'Alice' },
      types: ['ExampleCredential']
    });
    expect(vc['@context']).toContain('https://www.w3.org/ns/credentials/v2');
    expect(vc.type).toContain('ExampleCredential');
    expect(vc.issuer).toBe(issuerDid);
    expect(vc.credentialSubject).toHaveProperty('name', 'Alice');
  });

  it('signs the VC and does not mutate', () => {
    const vc = createCredential({
      issuer: issuerDid,
      subject: { id: holderDid, name: 'Alice' }
    });
    const signed = signCredential(vc, issuerKeys.privateKey, issuerKeyId);
    expect(signed.proof).toBeDefined();
    expect(Array.isArray(signed.proof) ? signed.proof[0].type : signed.proof?.type).toBe('Ed25519Signature2020');
    expect(vc.proof).toBeUndefined();
  });

  it('verifies VC signature with correct key', () => {
    const vc = createCredential({
      issuer: issuerDid,
      subject: { id: holderDid, name: 'Alice' }
    });
    const signed = signCredential(vc, issuerKeys.privateKey, issuerKeyId);
    const isValid = verifyCredentialSignature(signed, issuerKeys.publicKey);
    expect(isValid).toBe(true);
  });

  it('fails to verify VC with wrong key', () => {
    const vc = createCredential({
      issuer: issuerDid,
      subject: { id: holderDid, name: 'Alice' }
    });
    const signed = signCredential(vc, issuerKeys.privateKey, issuerKeyId);
    const isValid = verifyCredentialSignature(signed, holderKeys.publicKey);
    expect(isValid).toBe(false);
  });
});

describe('verifyCredential (resolver-integrated)', () => {
  it('verifies a VC by resolving the issuer DID', async () => {
    const vc = createCredential({
      issuer: issuerDid,
      subject: { id: holderDid, name: 'Alice' }
    });
    const signed = signCredential(vc, issuerKeys.privateKey, issuerKeyId);

    const result = await verifyCredential(signed, resolver);
    expect(result.valid).toBe(true);
    expect(result.issuerVerified).toBe(true);
    expect(result.proofVerified).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when VC was signed by a different key than the issuer DID', async () => {
    const vc = createCredential({
      issuer: issuerDid,
      subject: { id: holderDid, name: 'Alice' }
    });
    // Sign with holder's key but claim issuer DID
    const signed = signCredential(vc, holderKeys.privateKey, holderKeyId);

    const result = await verifyCredential(signed, resolver);
    expect(result.valid).toBe(false);
    expect(result.issuerVerified).toBe(true); // DID resolved OK
    expect(result.proofVerified).toBe(false); // Signature doesn't match
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error for VC without proof', async () => {
    const vc = createCredential({
      issuer: issuerDid,
      subject: { id: holderDid, name: 'Alice' }
    });
    const result = await verifyCredential(vc, resolver);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Credential has no proof');
  });

  it('detects expired credentials', async () => {
    const vc = createCredential({
      issuer: issuerDid,
      subject: { id: holderDid, name: 'Alice' },
      expirationDate: '2020-01-01T00:00:00Z'
    });
    const signed = signCredential(vc, issuerKeys.privateKey, issuerKeyId);

    const result = await verifyCredential(signed, resolver);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('expired'))).toBe(true);
  });
});

describe('Verifiable Presentations', () => {
  const vc = signCredential(
    createCredential({ issuer: issuerDid, subject: { id: holderDid } }),
    issuerKeys.privateKey,
    issuerKeyId
  );

  it('creates a VP with embedded credentials', () => {
    const vp = createPresentation({ credentials: [vc], holder: holderDid });
    expect(vp.verifiableCredential).toHaveLength(1);
    expect(vp.holder).toBe(holderDid);
  });

  it('signs the VP with challenge', () => {
    const vp = createPresentation({ credentials: [vc], holder: holderDid });
    const signed = signPresentation(vp, holderKeys.privateKey, holderKeyId, 'my-challenge');
    const proof = Array.isArray(signed.proof) ? signed.proof[0] : signed.proof;
    expect(proof?.challenge).toBe('my-challenge');
  });

  it('verifies VP signature with correct key', () => {
    const vp = createPresentation({ credentials: [vc], holder: holderDid });
    const signed = signPresentation(vp, holderKeys.privateKey, holderKeyId);
    const isValid = verifyPresentationSignature(signed, holderKeys.publicKey);
    expect(isValid).toBe(true);
  });

  it('fails to verify VP with wrong key', () => {
    const vp = createPresentation({ credentials: [vc], holder: holderDid });
    const signed = signPresentation(vp, holderKeys.privateKey, holderKeyId);
    const isValid = verifyPresentationSignature(signed, issuerKeys.publicKey);
    expect(isValid).toBe(false);
  });
});

describe('verifyPresentation (resolver-integrated)', () => {
  const vc = signCredential(
    createCredential({ issuer: issuerDid, subject: { id: holderDid, degree: 'CS' } }),
    issuerKeys.privateKey,
    issuerKeyId
  );

  it('verifies VP + all embedded VCs via resolver', async () => {
    const vp = createPresentation({ credentials: [vc], holder: holderDid });
    const signed = signPresentation(vp, holderKeys.privateKey, holderKeyId, 'challenge-123');

    const result = await verifyPresentation(signed, resolver);
    expect(result.valid).toBe(true);
    expect(result.holderVerified).toBe(true);
    expect(result.issuerVerified).toBe(true);
    expect(result.proofVerified).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when holder signature is wrong', async () => {
    const vp = createPresentation({ credentials: [vc], holder: holderDid });
    // Sign with issuer's key but the VP holder is the holder DID
    const signed = signPresentation(vp, issuerKeys.privateKey, issuerKeyId);

    const result = await verifyPresentation(signed, resolver);
    expect(result.valid).toBe(false);
    expect(result.holderVerified).toBe(false);
  });

  it('fails when embedded VC has bad signature', async () => {
    // Create a VC signed with the wrong key
    const badVc = signCredential(
      createCredential({ issuer: issuerDid, subject: { id: holderDid } }),
      holderKeys.privateKey, // wrong key for this issuer
      holderKeyId
    );
    const vp = createPresentation({ credentials: [badVc], holder: holderDid });
    const signed = signPresentation(vp, holderKeys.privateKey, holderKeyId);

    const result = await verifyPresentation(signed, resolver);
    expect(result.valid).toBe(false);
    expect(result.holderVerified).toBe(true); // VP sig is fine
    expect(result.issuerVerified).toBe(false); // VC sig is bad
    expect(result.errors.some(e => e.includes('Credential[0]'))).toBe(true);
  });

  it('returns error for VP without proof', async () => {
    const vp = createPresentation({ credentials: [vc], holder: holderDid });
    const result = await verifyPresentation(vp, resolver);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Presentation has no proof');
  });
});

describe('SD-JWT', () => {
  it('creates a disclosure', () => {
    const disc = createDisclosure('age', 30);
    expect(disc.claimName).toBe('age');
    expect(disc.claimValue).toBe(30);
    expect(disc.salt).toBeDefined();
    expect(disc.encoded).toBeDefined();
  });

  it('hashes a disclosure', () => {
    const disc = createDisclosure('age', 30);
    const hash = hashDisclosure(disc.encoded);
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });

  it('issues an SD-JWT with proper formatting', () => {
    const result = issueSDJWT({
      issuer: issuerDid,
      claims: { name: 'Alice', age: 30, country: 'India' },
      disclosureFrame: ['age', 'country'],
      privateKey: issuerKeys.privateKey
    });
    expect(result.compact.split('~')).toHaveLength(4);
    expect(result.disclosures).toHaveLength(2);
  });

  it('retains non-disclosed claims in JWT', () => {
    const result = issueSDJWT({
      issuer: issuerDid,
      claims: { name: 'Alice', age: 30 },
      disclosureFrame: ['age'],
      privateKey: issuerKeys.privateKey
    });
    expect(result.compact).toBeDefined();
  });

  it('presents SD-JWT with specific disclosures', () => {
    const issued = issueSDJWT({
      issuer: issuerDid,
      claims: { name: 'Alice', age: 30, country: 'India' },
      disclosureFrame: ['age', 'country'],
      privateKey: issuerKeys.privateKey
    });
    
    const presented = presentSDJWT(issued.compact, ['age']);
    expect(presented.split('~')).toHaveLength(3);
    expect(presented.split('~')[0]).toBe(issued.jwt);
  });

  it('verifies an SD-JWT (full disclosure)', () => {
    const issued = issueSDJWT({
      issuer: issuerDid,
      claims: { name: 'Alice', age: 30 },
      disclosureFrame: ['age'],
      privateKey: issuerKeys.privateKey
    });
    
    const verifyResult = verifySDJWT(issued.compact, issuerKeys.publicKey);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.disclosedClaims.name).toBe('Alice');
    expect(verifyResult.disclosedClaims.age).toBe(30);
  });

  it('verifies an SD-JWT (partial disclosure)', () => {
    const issued = issueSDJWT({
      issuer: issuerDid,
      claims: { name: 'Alice', age: 30, country: 'India' },
      disclosureFrame: ['age', 'country'],
      privateKey: issuerKeys.privateKey
    });
    
    const presented = presentSDJWT(issued.compact, ['country']);
    const verifyResult = verifySDJWT(presented, issuerKeys.publicKey);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.disclosedClaims.name).toBe('Alice');
    expect(verifyResult.disclosedClaims.country).toBe('India');
    expect(verifyResult.disclosedClaims.age).toBeUndefined();
  });

  it('fails verification with wrong key', () => {
    const issued = issueSDJWT({
      issuer: issuerDid,
      claims: { name: 'Alice', age: 30 },
      disclosureFrame: ['age'],
      privateKey: issuerKeys.privateKey
    });
    
    const verifyResult = verifySDJWT(issued.compact, holderKeys.publicKey);
    expect(verifyResult.valid).toBe(false);
  });

  it('fails verification with tampered disclosure', () => {
    const issued = issueSDJWT({
      issuer: issuerDid,
      claims: { name: 'Alice', age: 30 },
      disclosureFrame: ['age'],
      privateKey: issuerKeys.privateKey
    });
    
    const parts = issued.compact.split('~');
    parts[1] = parts[1] + 'a';
    const tampered = parts.join('~');
    
    const verifyResult = verifySDJWT(tampered, issuerKeys.publicKey);
    expect(verifyResult.valid).toBe(false);
  });
});

