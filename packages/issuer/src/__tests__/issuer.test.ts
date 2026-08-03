import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJWS, generateCodeChallenge, generateCodeVerifier, generateEd25519KeyPair } from '@breakchain/crypto';
import { generateDidKey } from '@breakchain/did';
import { createIssuerServer } from '../index';

describe('issuer server', () => {
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;

  beforeAll(async () => {
    const dbPath = path.join(tmpdir(), `breakchain-issuer-${Date.now()}.db`);
    const app = createIssuerServer({
      port: 0,
      databasePath: dbPath,
      issuerDid: 'did:key:testissuer',
      adminToken: 'admin-token',
    });

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server did not bind to a TCP port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('serves issuer metadata and completes offer → token → credential flow', async () => {
    const metadataRes = await fetch(`${baseUrl}/.well-known/openid-credential-issuer`);
    expect(metadataRes.ok).toBe(true);
    const metadata = await metadataRes.json();
    expect(metadata.credential_issuer).toBeDefined();
    expect(metadata.authorization_servers).toBeDefined();

    const offerRes = await fetch(`${baseUrl}/api/credential-offer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialType: 'IDCard', format: 'ldp_vc' }),
    });
    expect(offerRes.ok).toBe(true);
    const offer = await offerRes.json();
    expect(offer.offer_url).toContain('/api/credential-offer');
    expect(offer.pre_authorized_code).toBeDefined();

    const tokenRes = await fetch(`${baseUrl}/api/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pre_authorized_code: offer.pre_authorized_code }),
    });
    expect(tokenRes.ok).toBe(true);
    const token = await tokenRes.json();
    expect(token.access_token).toBeDefined();
    expect(token.c_nonce).toBeDefined();

    const holderKeys = generateEd25519KeyPair();
    const holderDid = generateDidKey(holderKeys.publicKey);
    const proofJwt = createJWS({ nonce: token.c_nonce, holderDid }, holderKeys.privateKey);

    const credentialRes = await fetch(`${baseUrl}/api/credential`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({
        format: 'ldp_vc',
        proof: { jwt: proofJwt },
        holderDid,
      }),
    });

    expect(credentialRes.ok).toBe(true);
    const credentialPayload = await credentialRes.json();
    expect(credentialPayload.credential).toBeDefined();
    expect(credentialPayload.credential.credentialSubject.id).toBe(holderDid);
  });

  it('supports authorization-code + PKCE flow', async () => {
    const holderKeys = generateEd25519KeyPair();
    const holderDid = generateDidKey(holderKeys.publicKey);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const authorizeRes = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        credentialType: 'IDCard',
        holderDid,
        codeChallenge,
      }),
    });
    expect(authorizeRes.ok).toBe(true);
    const authorizePayload = await authorizeRes.json();
    expect(authorizePayload.code).toBeDefined();

    const tokenRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: authorizePayload.code,
        code_verifier: codeVerifier,
      }),
    });
    expect(tokenRes.ok).toBe(true);
    const token = await tokenRes.json();
    expect(token.access_token).toBeDefined();

    const proofJwt = createJWS({ nonce: token.c_nonce, holderDid }, holderKeys.privateKey);
    const credentialRes = await fetch(`${baseUrl}/api/credential`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({
        format: 'ldp_vc',
        proof: { jwt: proofJwt },
        holderDid,
      }),
    });

    expect(credentialRes.ok).toBe(true);
  });
});
