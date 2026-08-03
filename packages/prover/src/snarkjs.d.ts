declare module 'snarkjs' {
  export namespace groth16 {
    function fullProve(
      input: Record<string, any>,
      wasmFile: string | Uint8Array | ArrayBuffer,
      zkeyFile: string | Uint8Array | ArrayBuffer
    ): Promise<{ proof: any; publicSignals: string[] }>;

    function verify(
      verificationKey: any,
      publicSignals: string[],
      proof: any
    ): Promise<boolean>;
  }

  export namespace plonk {
    function fullProve(
      input: Record<string, any>,
      wasmFile: string | Uint8Array | ArrayBuffer,
      zkeyFile: string | Uint8Array | ArrayBuffer
    ): Promise<{ proof: any; publicSignals: string[] }>;

    function verify(
      verificationKey: any,
      publicSignals: string[],
      proof: any
    ): Promise<boolean>;
  }
}
