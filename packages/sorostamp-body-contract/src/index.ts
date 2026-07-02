import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  /**
   * public-signal count doesn't match the embedded verifying key
   */
  1: {message:"MalformedVerifyingKey"},
  /**
   * no public signals supplied (we need at least the nullifier at index 0)
   */
  2: {message:"NoPublicSignals"},
  /**
   * the Groth16 pairing check failed — the proof is not valid for this VK
   */
  3: {message:"InvalidProof"},
  /**
   * this email/proof was already sealed (nullifier seen before) — anti-replay
   */
  4: {message:"AlreadySealed"},
  /**
   * a public signal is >= the BN254 scalar field modulus (non-canonical encoding)
   */
  5: {message:"FieldElementNotCanonical"},
  /**
   * resuming SHA-256 over the public suffix did not reproduce the DKIM bh=
   */
  6: {message:"SuffixMismatch"},
  /**
   * consumedBytes is not block-aligned or too small to contain a window
   */
  7: {message:"BadConsumed"}
}


export interface Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}



/**
 * Same shape as the header verifier's attestation so every reader (server
 * route, client fallback, /p page) works against either contract unchanged.
 */
export interface Attestation {
  ledger: u32;
  nullifier: Buffer;
  statement_hash: Buffer;
  timestamp: u64;
}


export interface VerificationKey {
  alpha: Buffer;
  beta: Buffer;
  delta: Buffer;
  gamma: Buffer;
  ic: Array<Buffer>;
}

export interface Client {
  /**
   * Construct and simulate a is_sealed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_sealed: ({nullifier}: {nullifier: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a seal_body transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify a body proof AND seal it as a public attestation.
   * 
   * Check order is cheap-to-expensive (canonical form → replay → SHA over the
   * suffix → pairing) so invalid submissions cost the sponsor as little as
   * possible; nothing is persisted until every check has passed.
   * 
   * NOTE: `suffix` rides in the transaction, so it is public forever in the
   * ledger history. The client audits it for personal data and shows the user
   * exactly what will be published before submitting.
   */
  seal_body: ({proof, pub_signals, suffix}: {proof: Proof, pub_signals: Array<Buffer>, suffix: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a verify_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pure verification of proof + suffix, no state change. Returns true only
   * if BOTH the pairing check and the SHA completion against bh= pass.
   */
  verify_proof: ({proof, pub_signals, suffix}: {proof: Proof, pub_signals: Array<Buffer>, suffix: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a get_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a sealed attestation by id (== nullifier) — same ABI as the header
   * verifier so the /p page readers work against either contract.
   */
  get_attestation: ({id}: {id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Attestation>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAADxwdWJsaWMtc2lnbmFsIGNvdW50IGRvZXNuJ3QgbWF0Y2ggdGhlIGVtYmVkZGVkIHZlcmlmeWluZyBrZXkAAAAVTWFsZm9ybWVkVmVyaWZ5aW5nS2V5AAAAAAAAAQAAAEZubyBwdWJsaWMgc2lnbmFscyBzdXBwbGllZCAod2UgbmVlZCBhdCBsZWFzdCB0aGUgbnVsbGlmaWVyIGF0IGluZGV4IDApAAAAAAAPTm9QdWJsaWNTaWduYWxzAAAAAAIAAABHdGhlIEdyb3RoMTYgcGFpcmluZyBjaGVjayBmYWlsZWQg4oCUIHRoZSBwcm9vZiBpcyBub3QgdmFsaWQgZm9yIHRoaXMgVksAAAAADEludmFsaWRQcm9vZgAAAAMAAABLdGhpcyBlbWFpbC9wcm9vZiB3YXMgYWxyZWFkeSBzZWFsZWQgKG51bGxpZmllciBzZWVuIGJlZm9yZSkg4oCUIGFudGktcmVwbGF5AAAAAA1BbHJlYWR5U2VhbGVkAAAAAAAABAAAAE1hIHB1YmxpYyBzaWduYWwgaXMgPj0gdGhlIEJOMjU0IHNjYWxhciBmaWVsZCBtb2R1bHVzIChub24tY2Fub25pY2FsIGVuY29kaW5nKQAAAAAAABhGaWVsZEVsZW1lbnROb3RDYW5vbmljYWwAAAAFAAAARnJlc3VtaW5nIFNIQS0yNTYgb3ZlciB0aGUgcHVibGljIHN1ZmZpeCBkaWQgbm90IHJlcHJvZHVjZSB0aGUgREtJTSBiaD0AAAAAAA5TdWZmaXhNaXNtYXRjaAAAAAAABgAAAENjb25zdW1lZEJ5dGVzIGlzIG5vdCBibG9jay1hbGlnbmVkIG9yIHRvbyBzbWFsbCB0byBjb250YWluIGEgd2luZG93AAAAAAtCYWRDb25zdW1lZAAAAAAH",
        "AAAAAQAAAAAAAAAAAAAABVByb29mAAAAAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==",
        "AAAABQAAAAAAAAAAAAAABlNlYWxlZAAAAAAAAQAAAAZzZWFsZWQAAAAAAAIAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAQAAAAAAAAAOc3RhdGVtZW50X2hhc2gAAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAAAQAAAJFTYW1lIHNoYXBlIGFzIHRoZSBoZWFkZXIgdmVyaWZpZXIncyBhdHRlc3RhdGlvbiBzbyBldmVyeSByZWFkZXIgKHNlcnZlcgpyb3V0ZSwgY2xpZW50IGZhbGxiYWNrLCAvcCBwYWdlKSB3b3JrcyBhZ2FpbnN0IGVpdGhlciBjb250cmFjdCB1bmNoYW5nZWQuAAAAAAAAAAAAAAtBdHRlc3RhdGlvbgAAAAAEAAAAAAAAAAZsZWRnZXIAAAAAAAQAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAAAAAA5zdGF0ZW1lbnRfaGFzaAAAAAAD7gAAACAAAAAAAAAACXRpbWVzdGFtcAAAAAAAAAY=",
        "AAAAAQAAAAAAAAAAAAAAD1ZlcmlmaWNhdGlvbktleQAAAAAFAAAAAAAAAAVhbHBoYQAAAAAAA+4AAABAAAAAAAAAAARiZXRhAAAD7gAAAIAAAAAAAAAABWRlbHRhAAAAAAAD7gAAAIAAAAAAAAAABWdhbW1hAAAAAAAD7gAAAIAAAAAAAAAAAmljAAAAAAPqAAAD7gAAAEA=",
        "AAAAAAAAAAAAAAAJaXNfc2VhbGVkAAAAAAAAAQAAAAAAAAAJbnVsbGlmaWVyAAAAAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAdJWZXJpZnkgYSBib2R5IHByb29mIEFORCBzZWFsIGl0IGFzIGEgcHVibGljIGF0dGVzdGF0aW9uLgoKQ2hlY2sgb3JkZXIgaXMgY2hlYXAtdG8tZXhwZW5zaXZlIChjYW5vbmljYWwgZm9ybSDihpIgcmVwbGF5IOKGkiBTSEEgb3ZlciB0aGUKc3VmZml4IOKGkiBwYWlyaW5nKSBzbyBpbnZhbGlkIHN1Ym1pc3Npb25zIGNvc3QgdGhlIHNwb25zb3IgYXMgbGl0dGxlIGFzCnBvc3NpYmxlOyBub3RoaW5nIGlzIHBlcnNpc3RlZCB1bnRpbCBldmVyeSBjaGVjayBoYXMgcGFzc2VkLgoKTk9URTogYHN1ZmZpeGAgcmlkZXMgaW4gdGhlIHRyYW5zYWN0aW9uLCBzbyBpdCBpcyBwdWJsaWMgZm9yZXZlciBpbiB0aGUKbGVkZ2VyIGhpc3RvcnkuIFRoZSBjbGllbnQgYXVkaXRzIGl0IGZvciBwZXJzb25hbCBkYXRhIGFuZCBzaG93cyB0aGUgdXNlcgpleGFjdGx5IHdoYXQgd2lsbCBiZSBwdWJsaXNoZWQgYmVmb3JlIHN1Ym1pdHRpbmcuAAAAAAAJc2VhbF9ib2R5AAAAAAAAAwAAAAAAAAAFcHJvb2YAAAAAAAfQAAAABVByb29mAAAAAAAAAAAAAAtwdWJfc2lnbmFscwAAAAPqAAAD7gAAACAAAAAAAAAABnN1ZmZpeAAAAAAADgAAAAEAAAPpAAAD7gAAACAAAAAD",
        "AAAAAAAAAIpQdXJlIHZlcmlmaWNhdGlvbiBvZiBwcm9vZiArIHN1ZmZpeCwgbm8gc3RhdGUgY2hhbmdlLiBSZXR1cm5zIHRydWUgb25seQppZiBCT1RIIHRoZSBwYWlyaW5nIGNoZWNrIGFuZCB0aGUgU0hBIGNvbXBsZXRpb24gYWdhaW5zdCBiaD0gcGFzcy4AAAAAAAx2ZXJpZnlfcHJvb2YAAAADAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAAAAAAAC3B1Yl9zaWduYWxzAAAAA+oAAAPuAAAAIAAAAAAAAAAGc3VmZml4AAAAAAAOAAAAAQAAA+kAAAABAAAAAw==",
        "AAAAAAAAAIdSZWFkIGEgc2VhbGVkIGF0dGVzdGF0aW9uIGJ5IGlkICg9PSBudWxsaWZpZXIpIOKAlCBzYW1lIEFCSSBhcyB0aGUgaGVhZGVyCnZlcmlmaWVyIHNvIHRoZSAvcCBwYWdlIHJlYWRlcnMgd29yayBhZ2FpbnN0IGVpdGhlciBjb250cmFjdC4AAAAAD2dldF9hdHRlc3RhdGlvbgAAAAABAAAAAAAAAAJpZAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAALQXR0ZXN0YXRpb24A" ]),
      options
    )
  }
  public readonly fromJSON = {
    is_sealed: this.txFromJSON<boolean>,
        seal_body: this.txFromJSON<Result<Buffer>>,
        verify_proof: this.txFromJSON<Result<boolean>>,
        get_attestation: this.txFromJSON<Option<Attestation>>
  }
}