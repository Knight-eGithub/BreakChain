/**
 * Integration tests for @breakchain/sdk
 *
 * Tests cover:
 * - PresentationRequestBuilder: ClaimRequest[] → PresentationDefinition conversion
 * - HttpWalletAdapter: connection, presentation requests, error handling
 * - VerificationEngine: standard VP, ZKP VP, revocation checking
 * - BreakchainSDK: full SDK → Wallet → Issuer round-trip
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';

import { BreakchainSDK } from '../sdk';
import { HttpWalletAdapter } from '../http-wallet-adapter';
import { PresentationRequestBuilder } from '../request-builder';
import { VerificationEngine } from '../verification-engine';

import { createWalletApp } from '@breakchain/wallet';
import { createApp as createIssuerApp } from '@breakchain/issuer';
import { MockProverBackend } from '@breakchain/prover';

// ─── PresentationRequestBuilder Tests ───────────────────────────────────────

describe('PresentationRequestBuilder', () => {
  it('builds a PresentationDefinition from ClaimRequests', () => {
    const def = PresentationRequestBuilder.build([
      { field: 'age', condition: '>=18' },
      { field: 'nationality', equals: 'US' },
    ]);

    expect(def.id).toBeDefined();
    expect(def.input_descriptors).toHaveLength(2);

    // Age descriptor
    const ageDesc = def.input_descriptors[0];
    expect(ageDesc.constraints.fields[0].path).toEqual(['$.credentialSubject.age']);
    expect(ageDesc.constraints.fields[0].filter?.minimum).toBe(18);

    // Nationality descriptor
    const natDesc = def.input_descriptors[1];
    expect(natDesc.constraints.fields[0].path).toEqual(['$.credentialSubject.nationality']);
    expect(natDesc.constraints.fields[0].filter?.const).toBe('US');
  });

  it('handles greater-than condition', () => {
    const def = PresentationRequestBuilder.build([{ field: 'score', condition: '>90' }]);
    expect(def.input_descriptors[0].constraints.fields[0].filter?.minimum).toBe(91);
  });

  it('handles less-than-or-equal condition', () => {
    const def = PresentationRequestBuilder.build([{ field: 'weight', condition: '<=100' }]);
    expect(def.input_descriptors[0].constraints.fields[0].filter?.maximum).toBe(100);
  });

  it('handles equality condition with ==', () => {
    const def = PresentationRequestBuilder.build([{ field: 'country', condition: '==Germany' }]);
    expect(def.input_descriptors[0].constraints.fields[0].filter?.const).toBe('Germany');
    expect(def.input_descriptors[0].constraints.fields[0].filter?.type).toBe('string');
  });

  it('handles field-only claims (no condition)', () => {
    const def = PresentationRequestBuilder.build([{ field: 'name' }]);
    expect(def.input_descriptors[0].constraints.fields[0].path).toEqual(['$.credentialSubject.name']);
    expect(def.input_descriptors[0].constraints.fields[0].filter).toBeUndefined();
  });

  it('accepts custom name and purpose', () => {
    const def = PresentationRequestBuilder.build(
      [{ field: 'age' }],
      { name: 'Age Gate', purpose: 'Verify user is 18+' }
    );
    expect(def.name).toBe('Age Gate');
    expect(def.purpose).toBe('Verify user is 18+');
  });
});

// ─── Full SDK Integration Tests (SDK → Wallet → Issuer) ────────────────────

describe('BreakchainSDK (full integration)', () => {
  let issuerServer: http.Server;
  let issuerUrl: string;
  let issuerStore: any;

  let walletServer: http.Server;
  let walletUrl: string;
  let walletCore: any;

  const mockProver = new MockProverBackend();

  beforeAll(async () => {
    // 1. Start the reference issuer on a random port
    const issuerResult = createIssuerApp();
    issuerStore = issuerResult.store;

    issuerServer = await new Promise<http.Server>((resolve) => {
      const srv = issuerResult.app.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const issuerAddr = issuerServer.address() as AddressInfo;
    issuerUrl = `http://127.0.0.1:${issuerAddr.port}`;

    // 2. Start the reference wallet on a random port, pointed at the issuer
    const walletResult = createWalletApp({
      issuerUrl,
      walletOptions: { verifyOnImport: false },
      proverBackend: mockProver,
    });
    walletCore = walletResult.walletCore;
    await walletCore.initialize();

    walletServer = await new Promise<http.Server>((resolve) => {
      const srv = walletResult.app.listen(0, '127.0.0.1', () => resolve(srv));
    });
    const walletAddr = walletServer.address() as AddressInfo;
    walletUrl = `http://127.0.0.1:${walletAddr.port}`;

    // 3. Pre-load the wallet with a credential via the issuance flow
    await walletResult.issuanceClient.requestIssuance(
      'IDCard',
      walletCore.getDid(),
      { name: 'Alice', dateOfBirth: '1999-01-01', nationality: 'US', documentNumber: 'D1234' }
    );
  });

  afterAll(async () => {
    issuerStore.close();
    await new Promise<void>((resolve) => issuerServer.close(() => resolve()));
    await new Promise<void>((resolve) => walletServer.close(() => resolve()));
  });

  // ─── HttpWalletAdapter Tests ────────────────────────────────────────────

  describe('HttpWalletAdapter', () => {
    it('connects to the wallet and gets its DID', async () => {
      const adapter = new HttpWalletAdapter();
      const session = await adapter.connect({ walletUrl });
      expect(session.connected).toBe(true);
      expect(session.walletDid).toMatch(/^did:key:z6Mk/);
      expect(session.sessionId).toBeDefined();
    });

    it('fails to connect to a non-existent wallet', async () => {
      const adapter = new HttpWalletAdapter();
      await expect(
        adapter.connect({ walletUrl: 'http://127.0.0.1:59999' })
      ).rejects.toThrow();
    });

    it('sends a presentation request and receives a VP', async () => {
      const adapter = new HttpWalletAdapter();
      const session = await adapter.connect({ walletUrl });

      const definition = PresentationRequestBuilder.build([
        { field: 'name' },
      ]);

      const vp = await adapter.sendPresentationRequest(session, definition, 'test-nonce', {
        mode: 'plain',
      });

      expect(vp).toBeDefined();
      expect(vp.type).toContain('VerifiablePresentation');
      expect(vp.holder).toMatch(/^did:key:/);
      expect(vp.proof).toBeDefined();
    });
  });

  // ─── VerificationEngine Tests ───────────────────────────────────────────

  describe('VerificationEngine', () => {
    it('verifies a ZKP presentation with mock prover', async () => {
      const adapter = new HttpWalletAdapter();
      const session = await adapter.connect({ walletUrl });

      const definition = PresentationRequestBuilder.build([
        { field: 'name' },
      ]);

      const vp = await adapter.sendPresentationRequest(session, definition, 'verify-nonce', {
        mode: 'zkp',
        circuitId: 'age_over',
        claimRequests: [{ field: 'name', condition: '>=18' }],
      });

      const engine = new VerificationEngine({ proverBackend: mockProver });
      const result = await engine.verify(vp);

      expect(result.holderVerified).toBe(true);
      expect(result.proofVerified).toBe(true);
      expect(result.valid).toBe(true);
    });

    it('verifies a plain VP with holder and issuer signatures', async () => {
      const adapter = new HttpWalletAdapter();
      const session = await adapter.connect({ walletUrl });

      const definition = PresentationRequestBuilder.build([{ field: 'name' }]);
      const vp = await adapter.sendPresentationRequest(session, definition, 'plain-nonce', {
        mode: 'plain',
      });

      const engine = new VerificationEngine();
      const result = await engine.verify(vp);

      // Holder signature should verify (wallet signed the VP)
      expect(result.holderVerified).toBe(true);
      // Issuer signature should verify (the VC was signed by the issuer)
      expect(result.issuerVerified).toBe(true);
      expect(result.proofVerified).toBe(true);
      expect(result.valid).toBe(true);
    });
  });

  // ─── BreakchainSDK End-to-End Tests ─────────────────────────────────────

  describe('BreakchainSDK', () => {
    it('connects to a wallet and reports connected state', async () => {
      const sdk = new BreakchainSDK({ walletUrl });

      expect(sdk.isConnected()).toBe(false);
      const session = await sdk.connectWallet();
      expect(sdk.isConnected()).toBe(true);
      expect(session.walletDid).toMatch(/^did:key:/);
      expect(sdk.getWalletDid()).toBe(session.walletDid);

      await sdk.disconnect();
      expect(sdk.isConnected()).toBe(false);
    });

    it('requestProof with plain mode returns verified result', async () => {
      const sdk = new BreakchainSDK({ walletUrl, issuerUrl });
      await sdk.connectWallet();

      const result = await sdk.requestProof({
        claims: [{ field: 'name' }],
        mode: 'plain',
      });

      expect(result.verified).toBe(true);
      expect(result.presentation).toBeDefined();
      expect(result.revealedClaims).toBeDefined();
      expect(result.revealedClaims?.name).toBe('Alice');

      await sdk.disconnect();
    });

    it('requestProof with zkp mode returns verified ZK proof', async () => {
      const sdk = new BreakchainSDK(
        { walletUrl, issuerUrl },
        { proverBackend: mockProver }
      );
      await sdk.connectWallet();

      const result = await sdk.requestProof({
        claims: [{ field: 'name', condition: '>=18' }],
        mode: 'zkp',
        circuit: 'age_over',
      });

      expect(result.verified).toBe(true);
      expect(result.presentation).toBeDefined();
      expect(result.presentation?.type).toContain('ZKProofPresentation');
      expect(result.proofData).toBeDefined();

      await sdk.disconnect();
    });

    it('requestProof auto-connects if not connected', async () => {
      const sdk = new BreakchainSDK({ walletUrl });
      expect(sdk.isConnected()).toBe(false);

      const result = await sdk.requestProof({
        claims: [{ field: 'name' }],
        mode: 'plain',
      });

      expect(result.verified).toBe(true);
      expect(sdk.isConnected()).toBe(true);

      await sdk.disconnect();
    });

    it('requestProof returns error when no matching credentials', async () => {
      const sdk = new BreakchainSDK({ walletUrl });
      await sdk.connectWallet();

      const result = await sdk.requestProof({
        claims: [{ field: 'driverLicenseNumber' }],
        mode: 'plain',
      });

      expect(result.verified).toBe(false);
      expect(result.error).toBeDefined();

      await sdk.disconnect();
    });

    it('verifyPresentation independently verifies a VP', async () => {
      const sdk = new BreakchainSDK({ walletUrl, issuerUrl });
      await sdk.connectWallet();

      // Get a VP via requestProof
      const proofResult = await sdk.requestProof({
        claims: [{ field: 'name' }],
        mode: 'plain',
      });

      // Now verify it independently
      const verification = await sdk.verifyPresentation(proofResult.presentation!);
      expect(verification.valid).toBe(true);
      expect(verification.holderVerified).toBe(true);
      expect(verification.issuerVerified).toBe(true);

      await sdk.disconnect();
    });

    it('E2E: full issuer → wallet → SDK round-trip', async () => {
      // This test demonstrates the full Breakchain ecosystem:
      //
      // 1. Issuer has already issued a credential to the wallet (done in beforeAll)
      // 2. SDK connects to wallet
      // 3. SDK requests a proof about age
      // 4. Wallet generates a ZK proof
      // 5. SDK verifies the proof
      // 6. Access is granted

      const sdk = new BreakchainSDK(
        {
          walletUrl,
          issuerUrl,
          defaultProofMode: 'zkp',
        },
        { proverBackend: mockProver }
      );

      // Step 2: Connect
      const session = await sdk.connectWallet();
      expect(session.connected).toBe(true);

      // Step 3-5: Request and verify proof
      const result = await sdk.requestProof({
        claims: [
          { field: 'nationality', condition: '>=1' },
        ],
        mode: 'zkp',
        circuit: 'nationality_check',
        name: 'Nationality Verification',
        purpose: 'Verify user nationality for compliance',
      });

      // Step 6: Check result
      expect(result.verified).toBe(true);
      expect(result.presentation?.type).toContain('ZKProofPresentation');
      expect(result.proofData).toBeDefined();

      await sdk.disconnect();
    });
  });
});
