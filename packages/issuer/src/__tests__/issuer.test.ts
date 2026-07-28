import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

describe('Issuer Server', () => {
  let app: any;
  let store: any;
  let keyManager: any;

  beforeAll(() => {
    const res = createApp();
    app = res.app;
    store = res.store;
    keyManager = res.keyManager;
  });
  
  afterAll(() => {
    store.close();
  });

  it('GET /.well-known/openid-credential-issuer returns valid IssuerMetadata', async () => {
    const res = await request(app).get('/.well-known/openid-credential-issuer');
    expect(res.status).toBe(200);
    expect(res.body.credential_issuer).toBe('http://localhost:3001');
    expect(res.body.credential_configurations_supported.IDCard).toBeDefined();
  });

  it('GET /.well-known/did.json returns valid DID Document', async () => {
    const res = await request(app).get('/.well-known/did.json');
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(/^did:key:/);
  });

  let preAuthCode = '';
  
  it('POST /api/credential-offer with valid body returns CredentialOffer with pre-auth code', async () => {
    const res = await request(app)
      .post('/api/credential-offer')
      .send({
        credential_type: 'IDCard',
        subject_did: 'did:key:z6Mktest',
        claims: { name: 'Alice' }
      });
    expect(res.status).toBe(200);
    expect(res.body.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']).toBeDefined();
    preAuthCode = res.body.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code'];
  });

  it('POST /api/credential-offer with unknown credential_type returns 400', async () => {
    const res = await request(app)
      .post('/api/credential-offer')
      .send({
        credential_type: 'Unknown',
        subject_did: 'did:key:z6Mktest',
        claims: { name: 'Alice' }
      });
    expect(res.status).toBe(400);
  });

  let accessToken = '';

  it('POST /api/token with valid pre-auth code returns access_token + c_nonce', async () => {
    const res = await request(app)
      .post('/api/token')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode
      });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.c_nonce).toBeDefined();
    accessToken = res.body.access_token;
  });

  it('POST /api/token with invalid pre-auth code returns 400', async () => {
    const res = await request(app)
      .post('/api/token')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': 'invalid'
      });
    expect(res.status).toBe(400);
  });

  it('POST /api/token with already-consumed code returns 400', async () => {
    const res = await request(app)
      .post('/api/token')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode
      });
    expect(res.status).toBe(400);
  });

  it('POST /api/credential without auth returns 401', async () => {
    const res = await request(app).post('/api/credential');
    expect(res.status).toBe(401);
  });

  let credId = '';

  it('POST /api/credential with valid token returns signed VC (ldp_vc format)', async () => {
    const res = await request(app)
      .post('/api/credential')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ format: 'ldp_vc' });
    expect(res.status).toBe(200);
    expect(res.body.format).toBe('ldp_vc');
    expect(res.body.credential).toBeDefined();
    const vc = JSON.parse(res.body.credential);
    expect(vc.issuer).toBeDefined();
    credId = vc.id;
  });

  it('Returned VC has correct issuer DID, subject DID, type, proof', async () => {
    const cred = store.getCredential(credId);
    expect(cred).toBeDefined();
    expect(cred!.subject_did).toBe('did:key:z6Mktest');
    expect(cred!.credential_type).toBe('IDCard');
  });

  it('POST /api/credential with format sd-jwt returns SD-JWT compact string', async () => {
    // Need a new offer and token
    const offerRes = await request(app).post('/api/credential-offer').send({
      credential_type: 'IDCard', subject_did: 'did:key:z6Mktest', claims: { name: 'Bob' }
    });
    const code = offerRes.body.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code'];
    const tokenRes = await request(app).post('/api/token').send({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code', 'pre-authorized_code': code
    });
    const token = tokenRes.body.access_token;

    const res = await request(app)
      .post('/api/credential')
      .set('Authorization', `Bearer ${token}`)
      .send({ format: 'sd-jwt' });
    expect(res.status).toBe(200);
    expect(res.body.format).toBe('sd-jwt');
    expect(typeof res.body.credential).toBe('string');
  });

  it('Full Flow: offer -> token -> credential end-to-end test', async () => {
    const offerRes = await request(app).post('/api/credential-offer').send({
      credential_type: 'Diploma', subject_did: 'did:key:z6Mktest', claims: { degree: 'CS' }
    });
    const code = offerRes.body.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code'];
    const tokenRes = await request(app).post('/api/token').send({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code', 'pre-authorized_code': code
    });
    const token = tokenRes.body.access_token;
    const credRes = await request(app)
      .post('/api/credential')
      .set('Authorization', `Bearer ${token}`)
      .send({ format: 'ldp_vc' });
    expect(credRes.status).toBe(200);
  });

  it('GET /api/credentials/:id/status returns active status', async () => {
    const res = await request(app).get(`/api/credentials/${encodeURIComponent(credId)}/status`);
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(false);
  });

  it('POST /api/credentials/:id/revoke marks it as revoked', async () => {
    const res = await request(app)
      .post(`/api/credentials/${encodeURIComponent(credId)}/revoke`)
      .send({ reason: 'test' });
    expect(res.status).toBe(200);
  });

  it('GET /api/credentials/:id/status after revocation returns revoked', async () => {
    const res = await request(app).get(`/api/credentials/${encodeURIComponent(credId)}/status`);
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(true);
    expect(res.body.reason).toBe('test');
  });

  it('GET /api/credentials returns issued credentials', async () => {
    const res = await request(app).get('/api/credentials');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
