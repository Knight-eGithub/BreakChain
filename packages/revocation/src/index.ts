export class RevocationClient {
  constructor(private readonly issuerUrl: string) {}

  async checkStatus(credentialId: string): Promise<{ revoked: boolean }> {
    const response = await fetch(`${this.issuerUrl}/api/status?id=${encodeURIComponent(credentialId)}`);
    if (!response.ok) {
      throw new Error(`Revocation status request failed: ${response.status}`);
    }
    return response.json() as Promise<{ revoked: boolean }>;
  }
}
