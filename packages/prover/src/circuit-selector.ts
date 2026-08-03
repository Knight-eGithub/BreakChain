import type { ClaimRequest, CircuitArtifact } from '@breakchain/core';

export interface CircuitMapping {
  circuitId: string;
  field: string;
  condition?: string;  // e.g. '>=', '==', 'exists'
  artifact: CircuitArtifact;
}

/**
 * Selects the appropriate circuit for a given claim request.
 */
export class CircuitSelector {
  private mappings: CircuitMapping[] = [];

  /**
   * Register a circuit mapping.
   */
  register(mapping: CircuitMapping): void {
    this.mappings.push(mapping);
  }

  /**
   * Find the circuit matching a claim request.
   * @returns The matching CircuitMapping, or null if none found.
   */
  select(request: ClaimRequest): CircuitMapping | null {
    // If explicit circuit ID is provided, use it
    if (request.circuit) {
      return this.mappings.find(m => m.circuitId === request.circuit) || null;
    }

    // Match by field name and condition
    return this.mappings.find(m => {
      if (m.field !== request.field) return false;
      if (request.condition && m.condition !== request.condition) return false;
      return true;
    }) || null;
  }

  /**
   * List all registered circuit mappings.
   */
  listCircuits(): CircuitMapping[] {
    return [...this.mappings];
  }
}
