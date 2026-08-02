/**
 * Integration tests for @breakchain/wallet
 *
 * Tests cover:
 * - WalletCore: initialization, credential storage, credential matching
 * - IssuanceClient: full OpenID4VCI flow against the reference issuer
 * - PresentationEngine: plain VP, ZKP, and SD-JWT presentation modes
 * - WalletServer: HTTP endpoint integration tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { WalletCore } from '../wallet-core';
import { IssuanceClient } from '../issuance-client';
import { PresentationEngine } from '../presentation-engine';
import { createWalletApp } from '../wallet-server';
import { createApp } from '@breakchain/issuer';
import { MockProverBackend } from '@breakchain/prover';
import { InMemoryKeyStore } from '@breakchain/crypto';
import { generateDidKey } from '@breakchain/did';
import { createCredential, signCredential } from '@breakchain/credentials';
import { generateEd25519KeyPair } from '@breakchain/crypto';
import type { VerifiableCredential, PresentationDefinition } from '@breakchain/core';
import http from 'http';
import type { AddressInfo } from 'net';

// ─── WalletCore Tests ───────────────────────────────────────────────────────

describe('WalletCore', () => {
  let wallet: WalletCore;

  beforeEach(() => {
    wallet = new WalletCore({ verifyOnImport: false });
  });

  it('initializes with a did:key identity', async () => {
    const did = await wallet.initialize();
    expect(did).toMatch(/^did:key:z6Mk/);
    expect(wallet.getDid()).toBe(did);
  });

  it('throws when getDid() called before initialize()', () => {
    expect(() => wallet.getDid()).toThrow('Wallet not initialized');
  });

  it('stores and retrieves credentials', async () => {
    await wallet.initialize();
    const vc: VerifiableCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:test-cred-1',
      type: ['VerifiableCredential', 'IDCard'],
      issuer: 'did:key:z6MkIssuer',
      issuanceDate: new Date().toISOString(),
      credentialSubject: { id: 'did:key:z6MkHolder', name: 'Alice', age: 25 },
    };

    await wallet.addCredential(vc);
    expect(wallet.getCredentialCount()).toBe(1);

    const creds = await wallet.getCredentials();
    expect(creds).toHaveLength(1);
    expect(creds[0].id).toBe('urn:uuid:test-cred-1');
  });

  it('retrieves credential by ID', async () => {
    await wallet.initialize();
    const vc: VerifiableCredential = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:find-me',
      type: ['VerifiableCredential'],
      issuer: 'did:key:z6MkIssuer',
      issuanceDate: new Date().toISOString(),
      credentialSubject: { name: 'Bob' },
    };

    await wallet.addCredential(vc);
    const found = await wallet.getCredentialById('urn:uuid:find-me');
    expect(found).not.toBeNull();
    expect((found!.credentialSubject as Record<string, unknown>).name).toBe('Bob');
  });

  it('findCredentials matches by field path', async () => {
    await wallet.initialize();

    // Add two credentials
    await wallet.addCredential({
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:id-card',
      type: ['VerifiableCredential', 'IDCard'],
      issuer: 'did:key:z6MkIssuer',
      issuanceDate: new Date().toISOString(),
      credentialSubject: { name: 'Alice', age: 25, nationality: 'US' },
    });
    await wallet.addCredential({
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:diploma',
      type: ['VerifiableCredential', 'Diploma'],
      issuer: 'did:key:z6MkIssuer',
      issuanceDate: new Date().toISOString(),
      credentialSubject: { name: 'Alice', degree: 'CS', institution: 'MIT' },
    });

    // Find credentials with 'age' field
    const matched = await wallet.findCredentials([{
      id: 'age-check',
      constraints: {
        fields: [{ path: ['$.credentialSubject.age'] }],
      },
    }]);

    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe('urn:uuid:id-card');
  });

  it('findCredentials returns empty when no match', async () => {
    await wallet.initialize();
    await wallet.addCredential({
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:diploma',
      type: ['VerifiableCredential', 'Diploma'],
      issuer: 'did:key:z6MkIssuer',
      issuanceDate: new Date().toISOString(),
      credentialSubject: { degree: 'CS' },
    });

    const matched = await wallet.findCredentials([{
      id: 'nonexistent',
      constraints: {
        fields: [{ path: ['$.credentialSubject.licenseNumber'] }],
      },
    }]);

    expect(matched).toHaveLength(0);
  });
});

// ─── IssuanceClient Tests (against reference issuer) ────────────────────────

describe('IssuanceClient (with Issuer)', () => {
  let issuerApp: any;
  let issuerStore: any;
  let issuerServer: http.Server;
  let issuerUrl: string;
  let wallet: WalletCore;
  let issuanceClient: IssuanceClient;

  beforeAll(async () => {
    // Start the reference issuer on a random port
    const result = createApp();
    issuerApp = result.app;
    issuerStore = result.store;

    issuerServer = await new Promise<http.Server>((resolve) => {
      const srv = issuerApp.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const addr = issuerServer.address() as AddressInfo;
    issuerUrl = `http://127.0.0.1:${addr.port}`;

    // Initialize wallet
    wallet = new WalletCore({ verifyOnImport: false });
    await wallet.initialize();

    issuanceClient = new IssuanceClient(wallet, { issuerUrl });
  });

  afterAll(async () => {
    issuerStore.close();
    await new Promise<void>((resolve) => issuerServer.close(() => resolve()));
  });

  it('fetches issuer metadata', async () => {
    const metadata = await issuanceClient.fetchIssuerMetadata();
    expect(metadata.credential_issuer).toBeDefined();
    expect(metadata.credential_configurations_supported).toBeDefined();
  });

  it('exchanges pre-auth code for token', async () => {
    // First create an offer
    const offerRes = await request(issuerApp).post('/api/credential-offer').send({
      credential_type: 'IDCard',
      subject_did: wallet.getDid(),
      claims: { name: 'Alice', dateOfBirth: '1999-01-01', nationality: 'US', documentNumber: 'D1234' },
    });
    const preAuthCode = offerRes.body.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code'];

    const tokenResponse = await issuanceClient.exchangePreAuthCode(preAuthCode);
    expect(tokenResponse.access_token).toBeDefined();
    expect(tokenResponse.c_nonce).toBeDefined();
    expect(tokenResponse.token_type).toBe('Bearer');
  });

  it('full issuance flow: requestIssuance stores VC in wallet', async () => {
    const initialCount = wallet.getCredentialCount();
    const result = await issuanceClient.requestIssuance(
      'IDCard',
      wallet.getDid(),
      { name: 'Alice', dateOfBirth: '1999-01-01', nationality: 'US', documentNumber: 'D5678' }
    );

    expect(result.success).toBe(true);
    expect(result.format).toBe('ldp_vc');
    expect(result.credential).toBeDefined();
    expect(result.credential!.proof).toBeDefined();
    expect(wallet.getCredentialCount()).toBe(initialCount + 1);
  });

  it('full issuance flow with sd-jwt format', async () => {
    const initialCount = wallet.getCredentialCount();
    const result = await issuanceClient.requestIssuance(
      'IDCard',
      wallet.getDid(),
      { name: 'Bob', dateOfBirth: '2000-06-15', nationality: 'UK', documentNumber: 'D9999' },
      'sd-jwt'
    );

    expect(result.success).toBe(true);
    expect(result.format).toBe('sd-jwt');
    expect(wallet.getCredentialCount()).toBe(initialCount + 1);
  });

  it('fails issuance with unknown credential type', async () => {
    const result = await issuanceClient.requestIssuance(
      'UnknownType',
      wallet.getDid(),
      { name: 'Charlie' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ─── PresentationEngine Tests ───────────────────────────────────────────────

describe('PresentationEngine', () => {
  let wallet: WalletCore;
  let engine: PresentationEngine;
  let mockProver: MockProverBackend;

  beforeAll(async () => {
    wallet = new WalletCore({ verifyOnImport: false });
    await wallet.initialize();

    // Add a test credential
    await wallet.addCredential({
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      id: 'urn:uuid:age-test',
      type: ['VerifiableCredential', 'IDCard'],
      issuer: 'did:key:z6MkIssuer',
      issuanceDate: new Date().toISOString(),
      credentialSubject: { id: wallet.getDid(), name: 'Alice', age: 25, nationality: 'US' },
    });

    mockProver = new MockProverBackend();
    engine = new PresentationEngine(wallet, mockProver);
  });

  const sampleDefinition: PresentationDefinition = {
    id: 'age-verification',
    input_descriptors: [{
      id: 'age-check',
      constraints: {
        fields: [{ path: ['$.credentialSubject.age'] }],
      },
    }],
  };

  it('creates a plain VP with holder signature', async () => {
    const response = await engine.processRequest({
      presentationDefinition: sampleDefinition,
      challenge: 'test-nonce-123',
      mode: 'plain',
    });

    expect(response.success).toBe(true);
    expect(response.proofType).toBe('plain');
    expect(response.presentation).toBeDefined();
    expect(response.presentation!.holder).toBe(wallet.getDid());
    expect(response.presentation!.proof).toBeDefined();

    const proof = response.presentation!.proof;
    const proofObj = Array.isArray(proof) ? proof[0] : proof;
    expect(proofObj!.type).toBe('Ed25519Signature2020');
    expect(proofObj!.challenge).toBe('test-nonce-123');
    expect(proofObj!.jws).toBeDefined();
  });

  it('creates a plain VP with embedded credentials', async () => {
    const response = await engine.processRequest({
      presentationDefinition: sampleDefinition,
      challenge: 'test-nonce-456',
      mode: 'plain',
    });

    expect(response.success).toBe(true);
    const vcs = response.presentation!.verifiableCredential || [];
    expect(vcs).toHaveLength(1);
    expect(vcs[0].id).toBe('urn:uuid:age-test');
  });

  it('creates a ZKP presentation with mock prover', async () => {
    const response = await engine.processRequest({
      presentationDefinition: sampleDefinition,
      challenge: 'zkp-nonce-789',
      mode: 'zkp',
      circuitId: 'age_over',
      claimRequests: [{ field: 'age', condition: '>=18' }],
    });

    expect(response.success).toBe(true);
    expect(response.proofType).toBe('zkp');
    expect(response.zkProof).toBeDefined();
    expect(response.zkProof!.proof).toBeDefined();
    expect(response.zkProof!.publicSignals).toBeDefined();

    // ZKP VP should NOT include the full credential
    expect(response.presentation!.verifiableCredential).toHaveLength(0);
    expect(response.presentation!.type).toContain('ZKProofPresentation');
  });

  it('fails ZKP without prover backend', async () => {
    const engineNoProver = new PresentationEngine(wallet);

    const response = await engineNoProver.processRequest({
      presentationDefinition: sampleDefinition,
      challenge: 'nonce',
      mode: 'zkp',
      claimRequests: [{ field: 'age' }],
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('No prover backend');
  });

  it('fails ZKP without claimRequests', async () => {
    const response = await engine.processRequest({
      presentationDefinition: sampleDefinition,
      challenge: 'nonce',
      mode: 'zkp',
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('claimRequests');
  });

  it('fails when no matching credentials found', async () => {
    const noMatchDef: PresentationDefinition = {
      id: 'nonexistent',
      input_descriptors: [{
        id: 'no-match',
        constraints: {
          fields: [{ path: ['$.credentialSubject.driverLicense'] }],
        },
      }],
    };

    const response = await engine.processRequest({
      presentationDefinition: noMatchDef,
      challenge: 'nonce',
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('No matching credentials');
  });
});

// ─── WalletServer Integration Tests ─────────────────────────────────────────

describe('WalletServer (HTTP)', () => {
  let walletApp: any;
  let walletCore: any;
  let issuerApp: any;
  let issuerStore: any;
  let issuerServer: http.Server;
  let issuerUrl: string;

  beforeAll(async () => {
    // Start the reference issuer
    const issuerResult = createApp();
    issuerApp = issuerResult.app;
    issuerStore = issuerResult.store;

    issuerServer = await new Promise<http.Server>((resolve) => {
      const srv = issuerApp.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const addr = issuerServer.address() as AddressInfo;
    issuerUrl = `http://127.0.0.1:${addr.port}`;

    // Create wallet app pointed at the issuer
    const walletResult = createWalletApp({
      issuerUrl,
      walletOptions: { verifyOnImport: false },
      proverBackend: new MockProverBackend(),
    });
    walletApp = walletResult.app;
    walletCore = walletResult.walletCore;

    // Initialize the wallet
    await walletCore.initialize();
  });

  afterAll(async () => {
    issuerStore.close();
    await new Promise<void>((resolve) => issuerServer.close(() => resolve()));
  });

  it('GET /api/identity returns wallet DID', async () => {
    const res = await request(walletApp).get('/api/identity');
    expect(res.status).toBe(200);
    expect(res.body.did).toMatch(/^did:key:z6Mk/);
    expect(res.body.initialized).toBe(true);
  });

  it('GET /api/credentials returns empty list initially', async () => {
    const res = await request(walletApp).get('/api/credentials');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('POST /api/receive-offer with shorthand issues and stores credential', async () => {
    const res = await request(walletApp)
      .post('/api/receive-offer')
      .send({
        credential_type: 'IDCard',
        claims: {
          name: 'Alice',
          dateOfBirth: '1999-01-01',
          nationality: 'US',
          documentNumber: 'D1234',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.credentialCount).toBe(1);
  });

  it('GET /api/credentials now returns the stored credential', async () => {
    const res = await request(walletApp).get('/api/credentials');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.credentials[0].type).toContain('IDCard');
    expect(res.body.credentials[0].hasProof).toBe(true);
  });

  it('POST /api/presentation-request creates a plain VP', async () => {
    const res = await request(walletApp)
      .post('/api/presentation-request')
      .send({
        presentationDefinition: {
          id: 'id-check',
          input_descriptors: [{
            id: 'id-card',
            constraints: {
              fields: [{ path: ['$.credentialSubject.name'] }],
            },
          }],
        },
        challenge: 'test-challenge-abc',
        mode: 'plain',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.proofType).toBe('plain');
    expect(res.body.presentation.holder).toMatch(/^did:key:/);
    expect(res.body.presentation.proof.challenge).toBe('test-challenge-abc');
  });

  it('POST /api/presentation-request with ZKP mode', async () => {
    const res = await request(walletApp)
      .post('/api/presentation-request')
      .send({
        presentationDefinition: {
          id: 'age-check',
          input_descriptors: [{
            id: 'age-over',
            constraints: {
              fields: [{ path: ['$.credentialSubject.name'] }],
            },
          }],
        },
        challenge: 'zkp-challenge-xyz',
        mode: 'zkp',
        circuitId: 'age_over',
        claimRequests: [{ field: 'name', condition: '>=18' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.proofType).toBe('zkp');
    expect(res.body.zkProof).toBeDefined();
  });

  it('POST /api/presentation-request with missing challenge returns 400', async () => {
    const res = await request(walletApp)
      .post('/api/presentation-request')
      .send({
        presentationDefinition: { id: 'test', input_descriptors: [] },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('challenge');
  });

  it('POST /api/receive-offer with missing fields returns 400', async () => {
    const res = await request(walletApp)
      .post('/api/receive-offer')
      .send({});

    expect(res.status).toBe(400);
  });

  // ─── Full End-to-End: Issuer → Wallet → Presentation ────────────────────

  it('E2E: issue credential from issuer → store in wallet → present as VP', async () => {
    // 1. Issue a Diploma credential through the wallet
    const issueRes = await request(walletApp)
      .post('/api/receive-offer')
      .send({
        credential_type: 'Diploma',
        claims: {
          name: 'Alice',
          degree: 'Computer Science',
          institution: 'MIT',
          graduationYear: '2024',
        },
      });
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.success).toBe(true);

    // 2. Present the diploma
    const presentRes = await request(walletApp)
      .post('/api/presentation-request')
      .send({
        presentationDefinition: {
          id: 'diploma-check',
          input_descriptors: [{
            id: 'diploma',
            constraints: {
              fields: [{ path: ['$.credentialSubject.degree'] }],
            },
          }],
        },
        challenge: 'e2e-nonce',
        mode: 'plain',
      });
    expect(presentRes.status).toBe(200);
    expect(presentRes.body.success).toBe(true);
    expect(presentRes.body.presentation.verifiableCredential).toBeDefined();
    expect(presentRes.body.presentation.verifiableCredential.length).toBeGreaterThan(0);
  });
});
