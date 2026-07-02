// snarkjs ships no type declarations. We only use groth16.fullProve in the
// browser (lib/prove.ts), so declare the minimal surface we touch.
declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string | Uint8Array,
      zkeyFile: string | Uint8Array
    ): Promise<{
      proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
      publicSignals: string[];
    }>;
    verify(
      vKey: unknown,
      publicSignals: string[],
      proof: unknown
    ): Promise<boolean>;
  };
}
