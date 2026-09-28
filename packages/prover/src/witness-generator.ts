import type { ClaimRequest } from '@breakchain/core';
import { sha256String } from '@breakchain/crypto';

export interface WitnessInput {
  circuitId: string;
  inputs: Record<string, string | bigint | number>;
}

/**
 * Generates circuit witness inputs from credential claims.
 * Handles encoding of fields, salt generation, and hash commitments.
 */
export class WitnessGenerator {
  /**
   * Generate witness inputs for an age-over proof.
   * @param age The holder's actual age
   * @param salt Random salt for the commitment
   * @param ageHash Poseidon(age, salt) — must be pre-computed
   */
  generateAgeOverInputs(age: number, salt: bigint, ageHash: bigint, ageThreshold: number = 18): WitnessInput {
    return {
      circuitId: 'age_over',
      inputs: {
        age: BigInt(age),
        salt,
        ageHash,
        ageThreshold: BigInt(ageThreshold)
      }
    };
  }

  /**
   * Generate witness inputs for a nationality check proof.
   * @param nationality Numeric encoding of nationality
   * @param salt Random salt
   * @param nationalityHash Poseidon(nationality, salt)
   * @param expectedNationality The expected nationality value
   */
  generateNationalityCheckInputs(
    nationality: bigint,
    salt: bigint,
    nationalityHash: bigint,
    expectedNationality: bigint
  ): WitnessInput {
    return {
      circuitId: 'nationality_check',
      inputs: {
        nationality,
        salt,
        nationalityHash,
        expectedNationality
      }
    };
  }

  /**
   * Generate witness inputs for credential ownership proof.
   * @param holderSecret The holder's secret key (bigint)
   * @param credentialHash Hash of the credential
   * @param ownershipCommitment Poseidon(holderSecret, credentialHash)
   */
  generateCredentialOwnershipInputs(
    holderSecret: bigint,
    credentialHash: bigint,
    ownershipCommitment: bigint
  ): WitnessInput {
    return {
      circuitId: 'credential_ownership',
      inputs: {
        holderSecret,
        credentialHash,
        ownershipCommitment
      }
    };
  }

  /**
   * Encode a string field to a numeric representation for circuit use.
   * Uses SHA-256 hash truncated to fit in a field element.
   * @param value The string value to encode
   * @returns A BigInt representation (first 31 bytes of SHA-256)
   */
  encodeStringField(value: string): bigint {
    const hex = sha256String(value);
    // Truncate to 31 bytes (248 bits) to stay within the BN128 field
    const truncated = hex.slice(0, 62);
    return BigInt('0x' + truncated);
  }
}
