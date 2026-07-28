import Database from 'better-sqlite3';

export interface StoredOffer {
  id?: string;
  pre_auth_code: string;
  credential_type: string;
  subject_did: string;
  claims: Record<string, unknown>;
  created_at?: string;
  consumed?: boolean;
}

export interface StoredToken {
  access_token: string;
  offer_id: string;
  c_nonce: string;
  expires_at: number;
  used?: boolean;
}

export interface CredentialMeta {
  id: string;
  issuer_did: string;
  subject_did: string;
  credential_type: string;
  format: string;
  issued_at: string;
  revoked?: boolean;
  revoked_at?: string;
  revoke_reason?: string;
}

export class IssuerStore {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pre_auth_code TEXT UNIQUE,
        credential_type TEXT,
        subject_did TEXT,
        claims TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        consumed BOOLEAN DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS tokens (
        access_token TEXT PRIMARY KEY,
        offer_id TEXT,
        c_nonce TEXT,
        expires_at INTEGER,
        used BOOLEAN DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        issuer_did TEXT,
        subject_did TEXT,
        credential_type TEXT,
        format TEXT,
        issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        revoked BOOLEAN DEFAULT 0,
        revoked_at DATETIME,
        revoke_reason TEXT
      );
    `);
  }

  createOffer(offer: StoredOffer): string {
    const stmt = this.db.prepare('INSERT INTO offers (pre_auth_code, credential_type, subject_did, claims) VALUES (?, ?, ?, ?)');
    const result = stmt.run(offer.pre_auth_code, offer.credential_type, offer.subject_did, JSON.stringify(offer.claims));
    return result.lastInsertRowid.toString();
  }

  getOffer(preAuthCode: string): StoredOffer | null {
    const stmt = this.db.prepare('SELECT * FROM offers WHERE pre_auth_code = ?');
    const row = stmt.get(preAuthCode) as any;
    if (!row) return null;
    return {
      id: row.id.toString(),
      pre_auth_code: row.pre_auth_code,
      credential_type: row.credential_type,
      subject_did: row.subject_did,
      claims: JSON.parse(row.claims),
      created_at: row.created_at,
      consumed: Boolean(row.consumed)
    };
  }
  
  getOfferById(id: string): StoredOffer | null {
    const stmt = this.db.prepare('SELECT * FROM offers WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id.toString(),
      pre_auth_code: row.pre_auth_code,
      credential_type: row.credential_type,
      subject_did: row.subject_did,
      claims: JSON.parse(row.claims),
      created_at: row.created_at,
      consumed: Boolean(row.consumed)
    };
  }

  createToken(token: StoredToken): void {
    const stmt = this.db.prepare('INSERT INTO tokens (access_token, offer_id, c_nonce, expires_at) VALUES (?, ?, ?, ?)');
    stmt.run(token.access_token, token.offer_id, token.c_nonce, token.expires_at);
  }

  getToken(accessToken: string): StoredToken | null {
    const stmt = this.db.prepare('SELECT * FROM tokens WHERE access_token = ?');
    const row = stmt.get(accessToken) as any;
    if (!row) return null;
    return {
      access_token: row.access_token,
      offer_id: row.offer_id.toString(),
      c_nonce: row.c_nonce,
      expires_at: row.expires_at,
      used: Boolean(row.used)
    };
  }

  consumeToken(accessToken: string): StoredToken | null {
    const token = this.getToken(accessToken);
    if (!token) return null;
    this.db.prepare('UPDATE tokens SET used = 1 WHERE access_token = ?').run(accessToken);
    return { ...token, used: true };
  }
  
  consumeOffer(preAuthCode: string): void {
     this.db.prepare('UPDATE offers SET consumed = 1 WHERE pre_auth_code = ?').run(preAuthCode);
  }

  storeCredential(meta: CredentialMeta): void {
    const stmt = this.db.prepare('INSERT INTO credentials (id, issuer_did, subject_did, credential_type, format) VALUES (?, ?, ?, ?, ?)');
    stmt.run(meta.id, meta.issuer_did, meta.subject_did, meta.credential_type, meta.format);
  }

  getCredential(id: string): CredentialMeta | null {
    const stmt = this.db.prepare('SELECT * FROM credentials WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      issuer_did: row.issuer_did,
      subject_did: row.subject_did,
      credential_type: row.credential_type,
      format: row.format,
      issued_at: row.issued_at,
      revoked: Boolean(row.revoked),
      revoked_at: row.revoked_at,
      revoke_reason: row.revoke_reason
    };
  }

  listCredentials(): CredentialMeta[] {
    const stmt = this.db.prepare('SELECT * FROM credentials');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      issuer_did: row.issuer_did,
      subject_did: row.subject_did,
      credential_type: row.credential_type,
      format: row.format,
      issued_at: row.issued_at,
      revoked: Boolean(row.revoked),
      revoked_at: row.revoked_at,
      revoke_reason: row.revoke_reason
    }));
  }

  revokeCredential(id: string, reason?: string): boolean {
    const stmt = this.db.prepare('UPDATE credentials SET revoked = 1, revoked_at = CURRENT_TIMESTAMP, revoke_reason = ? WHERE id = ?');
    const result = stmt.run(reason || null, id);
    return result.changes > 0;
  }

  getCredentialStatus(id: string): { id: string; revoked: boolean; revokedAt?: string; reason?: string } | null {
    const cred = this.getCredential(id);
    if (!cred) return null;
    return {
      id: cred.id,
      revoked: cred.revoked || false,
      revokedAt: cred.revoked_at,
      reason: cred.revoke_reason
    };
  }

  close(): void {
    this.db.close();
  }
}
