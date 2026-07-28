export interface CredentialSchema {
  type: string;
  context?: string[];
  claims: string[];
  disclosureFrame?: string[];
}

export interface IssuerConfig {
  port: number;
  host: string;
  issuerUrl: string;
  credentialSchemas: Record<string, CredentialSchema>;
}

export function createDefaultConfig(): IssuerConfig {
  return {
    port: 3001,
    host: 'localhost',
    issuerUrl: 'http://localhost:3001',
    credentialSchemas: {
      IDCard: {
        type: 'IDCard',
        claims: ['name', 'dateOfBirth', 'nationality', 'documentNumber'],
        disclosureFrame: ['dateOfBirth', 'nationality']
      },
      DriverLicense: {
        type: 'DriverLicense',
        claims: ['name', 'licenseNumber', 'category', 'expiryDate'],
        disclosureFrame: ['licenseNumber', 'category']
      },
      Diploma: {
        type: 'Diploma',
        claims: ['name', 'degree', 'institution', 'graduationYear'],
        disclosureFrame: ['degree', 'graduationYear']
      }
    }
  };
}
