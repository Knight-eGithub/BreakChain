import { createRequire } from 'node:module';

export interface StoredCredential {
  id: string;
  holderDid: string;
  type: string;
  status: 'active' | 'revoked';
  statusIndex: number;
  issuedAt: string;
}

export interface StoredToken {
  code: string;
  accessToken?: string;
  cNonce?: string;
  holderDid?: string | null;
  credentialType?: string | null;
  createdAt: string;
  used: boolean;
}

export interface StoredAuthCode {
  code: string;
  codeChallenge?: string | null;
  holderDid?: string | null;
  credentialType?: string | null;
  createdAt: string;
  used: boolean;
}

export interface IssuerStore {
  createToken(input: Omit<StoredToken, 'createdAt' | 'used'> & { createdAt?: string; used?: boolean }): StoredToken;
  getToken(code: string): StoredToken | undefined;
  getTokenByAccessToken(accessToken: string): StoredToken | undefined;
  createAuthCode(input: Omit<StoredAuthCode, 'createdAt' | 'used'> & { createdAt?: string; used?: boolean }): StoredAuthCode;
  getAuthCode(code: string): StoredAuthCode | undefined;
  consumeAuthCode(code: string, accessToken: string, cNonce: string): StoredAuthCode | undefined;
  saveCredential(credential: StoredCredential): StoredCredential;
  getCredential(id: string): StoredCredential | undefined;
  revokeCredential(id: string): StoredCredential | undefined;
  listCredentials(): StoredCredential[];
  allocateStatusIndex(): number;
}

class InMemoryIssuerStore implements IssuerStore {
  private readonly credentials = new Map<string, StoredCredential>();
  private readonly tokens = new Map<string, StoredToken>();
  private readonly authCodes = new Map<string, StoredAuthCode>();
  private nextStatusIndex = 0;

  createToken(input: Omit<StoredToken, 'createdAt' | 'used'> & { createdAt?: string; used?: boolean }): StoredToken {
    const token: StoredToken = {
      code: input.code,
      accessToken: input.accessToken,
      cNonce: input.cNonce,
      holderDid: input.holderDid ?? null,
      credentialType: input.credentialType ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
      used: input.used ?? false,
    };
    this.tokens.set(token.code, token);
    return token;
  }

  getToken(code: string): StoredToken | undefined {
    return this.tokens.get(code);
  }

  getTokenByAccessToken(accessToken: string): StoredToken | undefined {
    return Array.from(this.tokens.values()).find((token) => token.accessToken === accessToken);
  }

  createAuthCode(input: Omit<StoredAuthCode, 'createdAt' | 'used'> & { createdAt?: string; used?: boolean }): StoredAuthCode {
    const authCode: StoredAuthCode = {
      code: input.code,
      codeChallenge: input.codeChallenge ?? null,
      holderDid: input.holderDid ?? null,
      credentialType: input.credentialType ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
      used: input.used ?? false,
    };
    this.authCodes.set(authCode.code, authCode);
    return authCode;
  }

  getAuthCode(code: string): StoredAuthCode | undefined {
    return this.authCodes.get(code);
  }

  consumeAuthCode(code: string, accessToken: string, cNonce: string): StoredAuthCode | undefined {
    const authCode = this.authCodes.get(code);
    if (!authCode || authCode.used) {
      return undefined;
    }
    const consumed = { ...authCode, used: true };
    this.authCodes.set(code, consumed);
    this.createToken({
      code,
      accessToken,
      cNonce,
      holderDid: authCode.holderDid ?? null,
      credentialType: authCode.credentialType ?? null,
      createdAt: authCode.createdAt,
      used: true,
    });
    return consumed;
  }

  saveCredential(credential: StoredCredential): StoredCredential {
    const stored = credential.statusIndex >= 0 ? credential : { ...credential, statusIndex: this.allocateStatusIndex() };
    this.credentials.set(stored.id, stored);
    return stored;
  }

  getCredential(id: string): StoredCredential | undefined {
    return this.credentials.get(id);
  }

  revokeCredential(id: string): StoredCredential | undefined {
    const credential = this.credentials.get(id);
    if (!credential) {
      return undefined;
    }
    const revoked = { ...credential, status: 'revoked' as const };
    this.credentials.set(id, revoked);
    return revoked;
  }

  listCredentials(): StoredCredential[] {
    return Array.from(this.credentials.values());
  }

  allocateStatusIndex(): number {
    const index = this.nextStatusIndex;
    this.nextStatusIndex += 1;
    return index;
  }
}

class SqliteIssuerStore implements IssuerStore {
  private readonly db: any;
  private nextStatusIndex = 0;

  constructor(databasePath: string) {
    const require = createRequire(`${process.cwd()}/package.json`);
    const BetterSqlite3 = require('better-sqlite3') as new (path: string) => any;
    this.db = new BetterSqlite3(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        holder_did TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        status_index INTEGER,
        issued_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tokens (
        code TEXT PRIMARY KEY,
        access_token TEXT,
        c_nonce TEXT,
        holder_did TEXT,
        credential_type TEXT,
        created_at TEXT NOT NULL,
        used INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS auth_codes (
        code TEXT PRIMARY KEY,
        code_challenge TEXT,
        holder_did TEXT,
        credential_type TEXT,
        created_at TEXT NOT NULL,
        used INTEGER DEFAULT 0
      );
    `);
  }

  createToken(input: Omit<StoredToken, 'createdAt' | 'used'> & { createdAt?: string; used?: boolean }): StoredToken {
    const token: StoredToken = {
      code: input.code,
      accessToken: input.accessToken,
      cNonce: input.cNonce,
      holderDid: input.holderDid ?? null,
      credentialType: input.credentialType ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
      used: input.used ?? false,
    };
    this.db.prepare(
      'INSERT OR REPLACE INTO tokens (code, access_token, c_nonce, holder_did, credential_type, created_at, used) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(token.code, token.accessToken ?? null, token.cNonce ?? null, token.holderDid ?? null, token.credentialType ?? null, token.createdAt, token.used ? 1 : 0);
    return token;
  }

  getToken(code: string): StoredToken | undefined {
    const row = this.db.prepare('SELECT * FROM tokens WHERE code = ?').get(code);
    return row
      ? {
          code: row.code,
          accessToken: row.access_token ?? undefined,
          cNonce: row.c_nonce ?? undefined,
          holderDid: row.holder_did ?? null,
          credentialType: row.credential_type ?? null,
          createdAt: row.created_at,
          used: Boolean(row.used),
        }
      : undefined;
  }

  getTokenByAccessToken(accessToken: string): StoredToken | undefined {
    const row = this.db.prepare('SELECT * FROM tokens WHERE access_token = ?').get(accessToken);
    return row
      ? {
          code: row.code,
          accessToken: row.access_token ?? undefined,
          cNonce: row.c_nonce ?? undefined,
          holderDid: row.holder_did ?? null,
          credentialType: row.credential_type ?? null,
          createdAt: row.created_at,
          used: Boolean(row.used),
        }
      : undefined;
  }

  createAuthCode(input: Omit<StoredAuthCode, 'createdAt' | 'used'> & { createdAt?: string; used?: boolean }): StoredAuthCode {
    const authCode: StoredAuthCode = {
      code: input.code,
      codeChallenge: input.codeChallenge ?? null,
      holderDid: input.holderDid ?? null,
      credentialType: input.credentialType ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
      used: input.used ?? false,
    };
    this.db.prepare(
      'INSERT OR REPLACE INTO auth_codes (code, code_challenge, holder_did, credential_type, created_at, used) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(authCode.code, authCode.codeChallenge ?? null, authCode.holderDid ?? null, authCode.credentialType ?? null, authCode.createdAt, authCode.used ? 1 : 0);
    return authCode;
  }

  getAuthCode(code: string): StoredAuthCode | undefined {
    const row = this.db.prepare('SELECT * FROM auth_codes WHERE code = ?').get(code);
    return row
      ? {
          code: row.code,
          codeChallenge: row.code_challenge ?? null,
          holderDid: row.holder_did ?? null,
          credentialType: row.credential_type ?? null,
          createdAt: row.created_at,
          used: Boolean(row.used),
        }
      : undefined;
  }

  consumeAuthCode(code: string, accessToken: string, cNonce: string): StoredAuthCode | undefined {
    const authCode = this.getAuthCode(code);
    if (!authCode || authCode.used) {
      return undefined;
    }
    this.db.prepare('UPDATE auth_codes SET used = 1 WHERE code = ?').run(code);
    this.createToken({
      code,
      accessToken,
      cNonce,
      holderDid: authCode.holderDid ?? null,
      credentialType: authCode.credentialType ?? null,
      createdAt: authCode.createdAt,
      used: true,
    });
    return { ...authCode, used: true };
  }

  saveCredential(credential: StoredCredential): StoredCredential {
    const stored = credential.statusIndex >= 0 ? credential : { ...credential, statusIndex: this.allocateStatusIndex() };
    this.db.prepare(
      'INSERT OR REPLACE INTO credentials (id, holder_did, type, status, status_index, issued_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(stored.id, stored.holderDid, stored.type, stored.status, stored.statusIndex, stored.issuedAt);
    return stored;
  }

  getCredential(id: string): StoredCredential | undefined {
    const row = this.db.prepare('SELECT * FROM credentials WHERE id = ?').get(id);
    return row
      ? {
          id: row.id,
          holderDid: row.holder_did,
          type: row.type,
          status: row.status,
          statusIndex: Number(row.status_index ?? 0),
          issuedAt: row.issued_at,
        }
      : undefined;
  }

  revokeCredential(id: string): StoredCredential | undefined {
    const credential = this.getCredential(id);
    if (!credential) {
      return undefined;
    }
    this.db.prepare('UPDATE credentials SET status = ? WHERE id = ?').run('revoked', id);
    return { ...credential, status: 'revoked' };
  }

  listCredentials(): StoredCredential[] {
    const rows = this.db.prepare('SELECT * FROM credentials ORDER BY status_index ASC').all();
    return rows.map((row: any) => ({
      id: row.id,
      holderDid: row.holder_did,
      type: row.type,
      status: row.status,
      statusIndex: Number(row.status_index ?? 0),
      issuedAt: row.issued_at,
    }));
  }

  allocateStatusIndex(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(status_index), -1) AS maxStatusIndex FROM credentials').get();
    const index = Number(row.maxStatusIndex) + 1;
    return index;
  }
}

export function createIssuerStore(databasePath: string): IssuerStore {
  if (databasePath === ':memory:') {
    return new InMemoryIssuerStore();
  }

  try {
    return new SqliteIssuerStore(databasePath);
  } catch {
    return new InMemoryIssuerStore();
  }
}
