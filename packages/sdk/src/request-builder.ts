/**
 * PresentationRequestBuilder — Converts developer-friendly ClaimRequest[]
 * into a DIF Presentation Exchange PresentationDefinition.
 *
 * This is the "developer ergonomics" layer that lets web developers write:
 *   sdk.requestProof({ claims: [{ field: 'age', condition: '>=18' }] })
 * instead of manually constructing PresentationDefinition JSON.
 */
import type {
  ClaimRequest,
  PresentationDefinition,
  InputDescriptor,
  FieldConstraint,
} from '@breakchain/core';
import { generateSalt } from '@breakchain/crypto';

export interface RequestBuilderOptions {
  /** Human-readable name for the request */
  name?: string;
  /** Purpose description */
  purpose?: string;
}

export class PresentationRequestBuilder {
  /**
   * Builds a PresentationDefinition from an array of ClaimRequests.
   *
   * Each ClaimRequest becomes an InputDescriptor with appropriate field constraints.
   *
   * @param claims Array of claim requests (e.g. [{ field: 'age', condition: '>=18' }])
   * @param options Optional name/purpose for the request
   * @returns A DIF PresentationDefinition
   *
   * @example
   * ```ts
   * const def = PresentationRequestBuilder.build([
   *   { field: 'age', condition: '>=18' },
   *   { field: 'nationality', equals: 'US' },
   * ]);
   * ```
   */
  static build(claims: ClaimRequest[], options?: RequestBuilderOptions): PresentationDefinition {
    const inputDescriptors: InputDescriptor[] = claims.map((claim, index) => {
      const fieldConstraint = PresentationRequestBuilder.claimToFieldConstraint(claim);

      return {
        id: `claim-${index}-${claim.field}`,
        name: claim.field,
        purpose: claim.condition
          ? `Verify ${claim.field} ${claim.condition}`
          : `Verify ${claim.field}`,
        constraints: {
          fields: [fieldConstraint],
        },
      };
    });

    return {
      id: `req-${generateSalt(8)}`,
      name: options?.name || 'Breakchain Proof Request',
      purpose: options?.purpose || 'Verify credential claims',
      input_descriptors: inputDescriptors,
    };
  }

  /**
   * Converts a single ClaimRequest into a FieldConstraint.
   *
   * Supported conditions:
   * - `>=N`, `>N`, `<=N`, `<N` → filter with minimum/maximum
   * - `==value` → filter with const
   * - No condition → just path existence check
   */
  private static claimToFieldConstraint(claim: ClaimRequest): FieldConstraint {
    const path = [`$.credentialSubject.${claim.field}`];

    const constraint: FieldConstraint = { path };

    // Build filter from condition or equals
    if (claim.equals !== undefined) {
      constraint.filter = {
        type: typeof claim.equals === 'number' ? 'number' : 'string',
        const: claim.equals,
      };
    } else if (claim.condition) {
      const filter = PresentationRequestBuilder.parseCondition(claim.condition);
      if (filter) {
        constraint.filter = filter;
      }
    }

    return constraint;
  }

  /**
   * Parses a condition string like '>=18' or '<100' into a filter object.
   */
  private static parseCondition(condition: string): FieldConstraint['filter'] | null {
    // Match patterns like >=18, >18, <=100, <100, ==value
    const rangeMatch = condition.match(/^(>=|>|<=|<|==)\s*(.+)$/);
    if (!rangeMatch) return null;

    const [, operator, valueStr] = rangeMatch;
    const numValue = Number(valueStr);
    const isNumeric = !isNaN(numValue);

    switch (operator) {
      case '>=':
        return isNumeric ? { type: 'number', minimum: numValue } : null;
      case '>':
        return isNumeric ? { type: 'number', minimum: numValue + 1 } : null;
      case '<=':
        return isNumeric ? { type: 'number', maximum: numValue } : null;
      case '<':
        return isNumeric ? { type: 'number', maximum: numValue - 1 } : null;
      case '==':
        return isNumeric
          ? { type: 'number', const: numValue }
          : { type: 'string', const: valueStr.trim() };
      default:
        return null;
    }
  }
}
