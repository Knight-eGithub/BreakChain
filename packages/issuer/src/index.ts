import type { Express } from 'express';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { createCredential, signCredential, issueSDJWT } from '@breakchain/credentials';
import { generateEd25519KeyPair, publicKeyToMultibase, verifyJWS, generateCodeChallenge, base64urlEncode } from '@breakchain/crypto';
import { generateDidKey, didKeyToPublicKey } from '@breakchain/did';
import { createIssuerStore, type IssuerStore, type StoredCredential } from './in-memory-store';

export type CredentialFormat = 'ldp_vc' | 'sd-jwt';

export interface CredentialSchemaConfig {
  format: CredentialFormat;
  types: string[];
  claims?: Record<string, unknown>;
}

export interface IssuerConfig {
  port?: number;
  databasePath?: string;
  issuerDid?: string;
  adminToken?: string;
  issuerUrl?: string;
  credentialSchemas?: Record<string, CredentialSchemaConfig>;
}

export interface IssuerServerOptions extends IssuerConfig {}

interface CredentialProofPayload {
  nonce?: string;
  c_nonce?: string;
  holderDid?: string;
  sub?: string;
}

const DEFAULT_CREDENTIAL_SCHEMAS: Record<string, CredentialSchemaConfig> = {
  IDCard: {
    format: 'ldp_vc',
    types: ['VerifiableCredential', 'IDCard'],
    claims: {
      name: 'Alice',
      age: 25,
    },
  },
  DriverLicense: {
    format: 'ldp_vc',
    types: ['VerifiableCredential', 'DriverLicense'],
    claims: {
      name: 'Alice',
      licenseClass: 'B',
    },
  },
  Diploma: {
    format: 'sd-jwt',
    types: ['VerifiableCredential', 'Diploma'],
    claims: {
      name: 'Alice',
      degree: 'Computer Science',
      institution: 'BreakChain University',
    },
  },
};

export function createIssuerServer(config: IssuerConfig = {}): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const port = config.port ?? 3001;
  const adminToken = config.adminToken ?? 'admin-token';
  const issuerUrl = config.issuerUrl ?? `http://127.0.0.1:${port}`;
  const credentialSchemas = { ...DEFAULT_CREDENTIAL_SCHEMAS, ...(config.credentialSchemas ?? {}) };

  const issuerKeys = generateEd25519KeyPair();
  const issuerDid = config.issuerDid ?? generateDidKey(issuerKeys.publicKey);
  const verificationMethod = `${issuerDid}#${publicKeyToMultibase(issuerKeys.publicKey)}`;

  const store: IssuerStore = createIssuerStore(config.databasePath ?? ':memory:');

  function buildIssuedCredential(credentialType: string, holderDid: string, format: CredentialFormat, requestClaims: Record<string, unknown>): { credential: string | ReturnType<typeof createCredential>; credentialId: string; statusIndex: number } {
    const schema = credentialSchemas[credentialType];
    if (!schema) {
      throw new Error(`Unsupported credential type: ${credentialType}`);
    }

    const mergedClaims = {
      id: holderDid,
      ...(schema.claims ?? {}),
      ...requestClaims,
      credentialType,
    };

    const statusIndex = store.allocateStatusIndex();
    const credentialId = `urn:uuid:${randomUUID()}`;
    const credentialStatus = {
      id: `${issuerUrl}/api/status?id=${encodeURIComponent(credentialId)}`,
      type: 'StatusList2021Entry',
      statusListIndex: String(statusIndex),
      statusListCredential: `${issuerUrl}/api/status-list`,
      statusPurpose: 'revocation',
    };

    if (format === 'sd-jwt') {
      const issued = issueSDJWT({
        issuer: issuerDid,
        subject: holderDid,
        claims: mergedClaims,
        disclosureFrame: Object.keys(mergedClaims).filter((key) => key !== 'id' && key !== 'credentialType'),
        privateKey: issuerKeys.privateKey,
      });

      return { credential: issued.compact, credentialId, statusIndex };
    }

    const unsignedCredential = createCredential({
      issuer: issuerDid,
      subject: mergedClaims,
      types: schema.types,
      id: credentialId,
      credentialStatus,
    });

    const signedCredential = signCredential(unsignedCredential, issuerKeys.privateKey, verificationMethod);
    return { credential: signedCredential, credentialId, statusIndex };
  }

  function verifyHolderProof(proofJwt: string, holderDid: string, nonce: string): { valid: boolean; error?: string } {
    if (!holderDid.startsWith('did:key:')) {
      return { valid: false, error: 'Holder DID must be did:key for proof verification' };
    }

    let publicKey: Uint8Array;
    try {
      publicKey = didKeyToPublicKey(holderDid);
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Invalid holder DID' };
    }

    let result;
    try {
      result = verifyJWS(proofJwt, publicKey);
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Invalid proof JWS' };
    }

    if (!result.valid) {
      return { valid: false, error: 'Proof-of-possession signature verification failed' };
    }

    const payload = result.payload as CredentialProofPayload;
    if (payload.nonce !== nonce && payload.c_nonce !== nonce) {
      return { valid: false, error: 'Proof nonce does not match c_nonce' };
    }

    if (payload.holderDid !== holderDid && payload.sub !== holderDid) {
      return { valid: false, error: 'Proof holder DID does not match request holder DID' };
    }

    return { valid: true };
  }

  function encodeStatusBitstring(credentials: StoredCredential[]): string {
    const maxIndex = credentials.reduce((max, credential) => Math.max(max, credential.statusIndex), -1);
    const bytes = new Uint8Array(Math.max(1, Math.ceil((maxIndex + 1) / 8)));

    for (const credential of credentials) {
      if (credential.status !== 'revoked') {
        continue;
      }

      const byteIndex = Math.floor(credential.statusIndex / 8);
      const bitIndex = credential.statusIndex % 8;
      bytes[byteIndex] |= 1 << bitIndex;
    }

    return base64urlEncode(bytes);
  }

  app.get('/.well-known/openid-credential-issuer', (_req, res) => {
    res.json({
      credential_issuer: issuerDid,
      authorization_servers: [issuerUrl],
      credential_configurations_supported: Object.fromEntries(
        Object.entries(credentialSchemas).map(([schemaName, schema]) => [
          schemaName,
          {
            format: schema.format,
            types: schema.types,
            cryptographic_binding_methods_supported: ['did:key'],
          },
        ])
      ),
      credential_endpoint: `${issuerUrl}/api/credential`,
      token_endpoint: `${issuerUrl}/api/token`,
    });
  });

  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/authorize`,
      token_endpoint: `${issuerUrl}/api/token`,
      grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    });
  });

  app.get('/.well-known/did.json', (_req, res) => {
    res.json({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: issuerDid,
      verificationMethod: [
        {
          id: verificationMethod,
          type: 'Ed25519VerificationKey2020',
          controller: issuerDid,
          publicKeyMultibase: publicKeyToMultibase(issuerKeys.publicKey),
        },
      ],
      authentication: [verificationMethod],
      assertionMethod: [verificationMethod],
    });
  });

  app.post('/api/credential-offer', (req, res) => {
    const credentialType = typeof req.body?.credentialType === 'string' ? req.body.credentialType : 'IDCard';
    const schema = credentialSchemas[credentialType];
    if (!schema) {
      res.status(400).json({ error: `Unsupported credential type: ${credentialType}` });
      return;
    }

    const format = typeof req.body?.format === 'string' ? req.body.format : schema.format;
    const code = randomUUID();
    const accessToken = randomUUID();
    const cNonce = randomUUID();

    store.createToken({
      code,
      accessToken,
      cNonce,
      holderDid: req.body?.holderDid ?? null,
      credentialType,
      createdAt: new Date().toISOString(),
      used: false,
    });

    res.json({
      offer_url: `${issuerUrl}/api/credential-offer?code=${code}`,
      pre_authorized_code: code,
      format,
      credential_type: credentialType,
    });
  });

  app.get('/authorize', (req, res) => {
    const credentialType = typeof req.query.credentialType === 'string' ? req.query.credentialType : 'IDCard';
    const codeChallenge = typeof req.query.code_challenge === 'string' ? req.query.code_challenge : '';

    res.type('html').send(`
      <html>
        <body>
          <h1>BreakChain Issuer Login</h1>
          <form method="post" action="/authorize">
            <input name="credentialType" value="${credentialType}" />
            <input name="holderDid" value="did:key:holder" />
            <input name="codeChallenge" value="${codeChallenge}" />
            <button type="submit">Authorize</button>
          </form>
        </body>
      </html>
    `);
  });

  app.post('/authorize', (req, res) => {
    const credentialType = typeof req.body?.credentialType === 'string' ? req.body.credentialType : 'IDCard';
    const schema = credentialSchemas[credentialType];
    if (!schema) {
      res.status(400).json({ error: `Unsupported credential type: ${credentialType}` });
      return;
    }

    const code = randomUUID();
    store.createAuthCode({
      code,
      codeChallenge: typeof req.body?.codeChallenge === 'string' ? req.body.codeChallenge : null,
      holderDid: typeof req.body?.holderDid === 'string' ? req.body.holderDid : null,
      credentialType,
      createdAt: new Date().toISOString(),
      used: false,
    });

    res.json({ code, credential_type: credentialType });
  });

  app.post('/api/token', (req, res) => {
    const code = typeof req.body?.pre_authorized_code === 'string' ? req.body.pre_authorized_code : '';
    const tokenRow = store.getToken(code);

    if (!tokenRow) {
      res.status(404).json({ error: 'Unknown pre-authorized code' });
      return;
    }

    if (tokenRow.used) {
      res.status(400).json({ error: 'Code already used' });
      return;
    }

    const accessToken = tokenRow.accessToken ?? randomUUID();
    const cNonce = tokenRow.cNonce ?? randomUUID();
    store.createToken({
      code,
      accessToken,
      cNonce,
      holderDid: tokenRow.holderDid ?? null,
      credentialType: tokenRow.credentialType ?? null,
      createdAt: tokenRow.createdAt,
      used: true,
    });

    res.json({ access_token: accessToken, c_nonce: cNonce });
  });

  app.post('/token', (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const codeVerifier = typeof req.body?.code_verifier === 'string' ? req.body.code_verifier : '';
    const authCode = store.getAuthCode(code);

    if (!authCode) {
      res.status(404).json({ error: 'Unknown authorization code' });
      return;
    }

    if (authCode.used) {
      res.status(400).json({ error: 'Authorization code already used' });
      return;
    }

    if (authCode.codeChallenge && generateCodeChallenge(codeVerifier) !== authCode.codeChallenge) {
      res.status(400).json({ error: 'PKCE verification failed' });
      return;
    }

    const accessToken = randomUUID();
    const cNonce = randomUUID();
    store.consumeAuthCode(code, accessToken, cNonce);

    res.json({ access_token: accessToken, c_nonce: cNonce });
  });

  app.post('/api/credential', (req, res) => {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

    if (!token) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }

    const tokenRow = store.getTokenByAccessToken(token);

    if (!tokenRow) {
      res.status(401).json({ error: 'Invalid bearer token' });
      return;
    }

    const proof = req.body?.proof;
    const proofJwt = typeof proof?.jwt === 'string' ? proof.jwt : '';
    if (!proofJwt) {
      res.status(400).json({ error: 'Missing proof.jwt' });
      return;
    }

    const holderDid = typeof req.body?.holderDid === 'string' ? req.body.holderDid : tokenRow.holderDid ?? 'did:key:holder';
    const credentialType = typeof req.body?.credentialType === 'string' ? req.body.credentialType : tokenRow.credentialType ?? 'IDCard';
    const schema = credentialSchemas[credentialType];

    if (!schema) {
      res.status(400).json({ error: `Unsupported credential type: ${credentialType}` });
      return;
    }

    const format = typeof req.body?.format === 'string' ? req.body.format : schema.format;
    const requestClaims = req.body?.claims && typeof req.body.claims === 'object' ? (req.body.claims as Record<string, unknown>) : {};
    const popResult = verifyHolderProof(proofJwt, holderDid, tokenRow.cNonce ?? '');
    if (!popResult.valid) {
      res.status(400).json({ error: popResult.error ?? 'Holder proof verification failed' });
      return;
    }

    const { credential, credentialId, statusIndex } = buildIssuedCredential(credentialType, holderDid, format, requestClaims);

    const storedCredential = store.saveCredential({
      id: credentialId,
      holderDid,
      type: credentialType,
      status: 'active',
      statusIndex,
      issuedAt: new Date().toISOString(),
    });

    const credentialResponse =
      typeof credential === 'string'
        ? credential
        : {
            ...credential,
            credentialStatus: (credential as { credentialStatus?: unknown }).credentialStatus ?? {
              id: `${issuerUrl}/api/status?id=${encodeURIComponent(storedCredential.id)}`,
              type: 'StatusList2021Entry',
              statusListIndex: String(storedCredential.statusIndex),
              statusListCredential: `${issuerUrl}/api/status-list`,
              statusPurpose: 'revocation',
            },
          };

    res.json({
      format,
      credential: credentialResponse,
      c_nonce: tokenRow.cNonce,
    });
  });

  app.get('/api/status', (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) {
      res.status(400).json({ error: 'Missing credential id' });
      return;
    }

    const credentialRow = store.getCredential(id);
    res.json({ revoked: credentialRow?.status === 'revoked' });
  });

  app.post('/api/revoke', (req, res) => {
    const authorization = req.headers.authorization ?? '';
    if (authorization !== `Bearer ${adminToken}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const credentialId = typeof req.body?.credentialId === 'string' ? req.body.credentialId : '';
    if (!credentialId) {
      res.status(400).json({ error: 'Missing credentialId' });
      return;
    }

    const updated = store.revokeCredential(credentialId);
    if (!updated) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    res.json({ revoked: true, credentialId });
  });

  app.get('/api/status-list', (_req, res) => {
    const credentials = store.listCredentials();
    const encodedList = encodeStatusBitstring(credentials);

    const credential = createCredential({
      issuer: issuerDid,
      subject: {
        id: `${issuerUrl}/api/status-list#list`,
        type: 'StatusList2021StatusList',
        statusPurpose: 'revocation',
        encodedList,
      },
      types: ['StatusList2021Credential'],
    });
    const signedCredential = signCredential(credential, issuerKeys.privateKey, verificationMethod);

    res.json({ credential: signedCredential });
  });

  return app as unknown as Express;
}

export function startIssuerServer(config: IssuerConfig = {}): void {
  const app = createIssuerServer(config);
  const port = config.port ?? 3001;
  app.listen(port, () => {
    console.log(`Issuer server listening on http://127.0.0.1:${port}`);
  });
}
