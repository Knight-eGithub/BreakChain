/**
 * Custom error classes
 */

export class BreakchainError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WalletConnectionError extends BreakchainError {
  constructor(message: string = 'Wallet connection failed', details?: Record<string, unknown>) {
    super(message, 'WALLET_CONNECTION_FAILED', details);
  }
}

export class WalletDeniedError extends BreakchainError {
  constructor(message: string = 'Wallet request denied', details?: Record<string, unknown>) {
    super(message, 'WALLET_DENIED', details);
  }
}

export class CredentialNotFoundError extends BreakchainError {
  constructor(message: string = 'Credential not found', details?: Record<string, unknown>) {
    super(message, 'CREDENTIAL_NOT_FOUND', details);
  }
}

export class ProofGenerationError extends BreakchainError {
  constructor(message: string = 'Proof generation failed', details?: Record<string, unknown>) {
    super(message, 'PROOF_GENERATION_FAILED', details);
  }
}

export class InvalidProofError extends BreakchainError {
  constructor(message: string = 'Invalid proof', details?: Record<string, unknown>) {
    super(message, 'INVALID_PROOF', details);
  }
}

export class InvalidCredentialError extends BreakchainError {
  constructor(message: string = 'Invalid credential', details?: Record<string, unknown>) {
    super(message, 'INVALID_CREDENTIAL', details);
  }
}

export class RevocationError extends BreakchainError {
  constructor(message: string = 'Revocation check failed', details?: Record<string, unknown>) {
    super(message, 'REVOCATION_CHECK_FAILED', details);
  }
}

export class ProtocolError extends BreakchainError {
  constructor(message: string = 'Protocol error', details?: Record<string, unknown>) {
    super(message, 'PROTOCOL_ERROR', details);
  }
}

export class TimeoutError extends BreakchainError {
  constructor(message: string = 'Operation timed out', details?: Record<string, unknown>) {
    super(message, 'TIMEOUT', details);
  }
}
