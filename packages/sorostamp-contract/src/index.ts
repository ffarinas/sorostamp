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


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CB3CYN27C3ATTI7GXDRSD5A5MMTKA5L5SB2A4RE32H3FPOKT3E2GWODV",
  }
} as const

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
  5: {message:"FieldElementNotCanonical"}
}


export interface Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}



/**
 * A public, on-chain record that a fact was proven from a DKIM-signed email.
 * Stored keyed by `nullifier` — this is exactly what the public page /p/:id reads.
 * It holds NO email contents: only commitments. Revealing it leaks nothing.
 */
export interface Attestation {
  /**
 * ledger sequence when it was sealed
 */
ledger: u32;
  /**
 * unique per email (== pub_signals[0]); the same email can't be sealed twice
 */
nullifier: Buffer;
  /**
 * domain-separated sha256 of the proven statement (public signals EXCEPT the
 * nullifier) — commits to the fact, recomputable by the frontend from link metadata
 */
statement_hash: Buffer;
  /**
 * ledger close timestamp when it was sealed
 */
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
   * Whether an email/proof carrying this nullifier has already been sealed.
   */
  is_sealed: ({nullifier}: {nullifier: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a submit_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verify a proof AND seal it as a public attestation.
   * 
   * This is the real entry point. Order matters:
   * 1. the proof must verify — that is what makes `pub_signals` trustworthy
   * (a valid proof cryptographically binds them; they are not free input);
   * 2. the nullifier (pub_signals[0], bound by the circuit to the email's DKIM
   * signature) must be unseen — otherwise the SAME email is being replayed;
   * 3. only then do we persist the attestation and emit an event.
   * 
   * Returns the attestation id (== the nullifier) used by the public /p/:id page.
   */
  submit_proof: ({proof, pub_signals}: {proof: Proof, pub_signals: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a verify_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pure verification: is `proof` valid for `pub_signals` under the embedded VK?
   * Read-only, changes no state. Useful for clients/tests; the real flow is
   * `submit_proof`, which also seals the result.
   */
  verify_proof: ({proof, pub_signals}: {proof: Proof, pub_signals: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

  /**
   * Construct and simulate a get_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Read a sealed attestation by id (== nullifier). Powers the public /p/:id page
   * with REAL on-chain state. Returns None if nothing was sealed under that id.
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
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABQAAADxwdWJsaWMtc2lnbmFsIGNvdW50IGRvZXNuJ3QgbWF0Y2ggdGhlIGVtYmVkZGVkIHZlcmlmeWluZyBrZXkAAAAVTWFsZm9ybWVkVmVyaWZ5aW5nS2V5AAAAAAAAAQAAAEZubyBwdWJsaWMgc2lnbmFscyBzdXBwbGllZCAod2UgbmVlZCBhdCBsZWFzdCB0aGUgbnVsbGlmaWVyIGF0IGluZGV4IDApAAAAAAAPTm9QdWJsaWNTaWduYWxzAAAAAAIAAABHdGhlIEdyb3RoMTYgcGFpcmluZyBjaGVjayBmYWlsZWQg4oCUIHRoZSBwcm9vZiBpcyBub3QgdmFsaWQgZm9yIHRoaXMgVksAAAAADEludmFsaWRQcm9vZgAAAAMAAABLdGhpcyBlbWFpbC9wcm9vZiB3YXMgYWxyZWFkeSBzZWFsZWQgKG51bGxpZmllciBzZWVuIGJlZm9yZSkg4oCUIGFudGktcmVwbGF5AAAAAA1BbHJlYWR5U2VhbGVkAAAAAAAABAAAAE1hIHB1YmxpYyBzaWduYWwgaXMgPj0gdGhlIEJOMjU0IHNjYWxhciBmaWVsZCBtb2R1bHVzIChub24tY2Fub25pY2FsIGVuY29kaW5nKQAAAAAAABhGaWVsZEVsZW1lbnROb3RDYW5vbmljYWwAAAAF",
        "AAAAAQAAAAAAAAAAAAAABVByb29mAAAAAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==",
        "AAAABQAAAHZFbWl0dGVkIG9uIGEgc3VjY2Vzc2Z1bCBzZWFsIHNvIGluZGV4ZXJzIGFuZCB0aGUgcHVibGljIHBhZ2UgY2FuIHJlYWN0LgpUb3BpYzogKCJzZWFsZWQiLCBudWxsaWZpZXIpOyBkYXRhOiBmYWN0X2hhc2guAAAAAAAAAAAABlNlYWxlZAAAAAAAAQAAAAZzZWFsZWQAAAAAAAIAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAQAAAAAAAAAOc3RhdGVtZW50X2hhc2gAAAAAA+4AAAAgAAAAAAAAAAI=",
        "AAAAAQAAAOdBIHB1YmxpYywgb24tY2hhaW4gcmVjb3JkIHRoYXQgYSBmYWN0IHdhcyBwcm92ZW4gZnJvbSBhIERLSU0tc2lnbmVkIGVtYWlsLgpTdG9yZWQga2V5ZWQgYnkgYG51bGxpZmllcmAg4oCUIHRoaXMgaXMgZXhhY3RseSB3aGF0IHRoZSBwdWJsaWMgcGFnZSAvcC86aWQgcmVhZHMuCkl0IGhvbGRzIE5PIGVtYWlsIGNvbnRlbnRzOiBvbmx5IGNvbW1pdG1lbnRzLiBSZXZlYWxpbmcgaXQgbGVha3Mgbm90aGluZy4AAAAAAAAAAAtBdHRlc3RhdGlvbgAAAAAEAAAAImxlZGdlciBzZXF1ZW5jZSB3aGVuIGl0IHdhcyBzZWFsZWQAAAAAAAZsZWRnZXIAAAAAAAQAAABKdW5pcXVlIHBlciBlbWFpbCAoPT0gcHViX3NpZ25hbHNbMF0pOyB0aGUgc2FtZSBlbWFpbCBjYW4ndCBiZSBzZWFsZWQgdHdpY2UAAAAAAAludWxsaWZpZXIAAAAAAAPuAAAAIAAAAJ5kb21haW4tc2VwYXJhdGVkIHNoYTI1NiBvZiB0aGUgcHJvdmVuIHN0YXRlbWVudCAocHVibGljIHNpZ25hbHMgRVhDRVBUIHRoZQpudWxsaWZpZXIpIOKAlCBjb21taXRzIHRvIHRoZSBmYWN0LCByZWNvbXB1dGFibGUgYnkgdGhlIGZyb250ZW5kIGZyb20gbGluayBtZXRhZGF0YQAAAAAADnN0YXRlbWVudF9oYXNoAAAAAAPuAAAAIAAAAClsZWRnZXIgY2xvc2UgdGltZXN0YW1wIHdoZW4gaXQgd2FzIHNlYWxlZAAAAAAAAAl0aW1lc3RhbXAAAAAAAAAG",
        "AAAAAQAAAAAAAAAAAAAAD1ZlcmlmaWNhdGlvbktleQAAAAAFAAAAAAAAAAVhbHBoYQAAAAAAA+4AAABAAAAAAAAAAARiZXRhAAAD7gAAAIAAAAAAAAAABWRlbHRhAAAAAAAD7gAAAIAAAAAAAAAABWdhbW1hAAAAAAAD7gAAAIAAAAAAAAAAAmljAAAAAAPqAAAD7gAAAEA=",
        "AAAAAAAAAEdXaGV0aGVyIGFuIGVtYWlsL3Byb29mIGNhcnJ5aW5nIHRoaXMgbnVsbGlmaWVyIGhhcyBhbHJlYWR5IGJlZW4gc2VhbGVkLgAAAAAJaXNfc2VhbGVkAAAAAAAAAQAAAAAAAAAJbnVsbGlmaWVyAAAAAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAhRWZXJpZnkgYSBwcm9vZiBBTkQgc2VhbCBpdCBhcyBhIHB1YmxpYyBhdHRlc3RhdGlvbi4KClRoaXMgaXMgdGhlIHJlYWwgZW50cnkgcG9pbnQuIE9yZGVyIG1hdHRlcnM6CjEuIHRoZSBwcm9vZiBtdXN0IHZlcmlmeSDigJQgdGhhdCBpcyB3aGF0IG1ha2VzIGBwdWJfc2lnbmFsc2AgdHJ1c3R3b3J0aHkKKGEgdmFsaWQgcHJvb2YgY3J5cHRvZ3JhcGhpY2FsbHkgYmluZHMgdGhlbTsgdGhleSBhcmUgbm90IGZyZWUgaW5wdXQpOwoyLiB0aGUgbnVsbGlmaWVyIChwdWJfc2lnbmFsc1swXSwgYm91bmQgYnkgdGhlIGNpcmN1aXQgdG8gdGhlIGVtYWlsJ3MgREtJTQpzaWduYXR1cmUpIG11c3QgYmUgdW5zZWVuIOKAlCBvdGhlcndpc2UgdGhlIFNBTUUgZW1haWwgaXMgYmVpbmcgcmVwbGF5ZWQ7CjMuIG9ubHkgdGhlbiBkbyB3ZSBwZXJzaXN0IHRoZSBhdHRlc3RhdGlvbiBhbmQgZW1pdCBhbiBldmVudC4KClJldHVybnMgdGhlIGF0dGVzdGF0aW9uIGlkICg9PSB0aGUgbnVsbGlmaWVyKSB1c2VkIGJ5IHRoZSBwdWJsaWMgL3AvOmlkIHBhZ2UuAAAADHN1Ym1pdF9wcm9vZgAAAAIAAAAAAAAABXByb29mAAAAAAAH0AAAAAVQcm9vZgAAAAAAAAAAAAALcHViX3NpZ25hbHMAAAAD6gAAA+4AAAAgAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
        "AAAAAAAAAMFQdXJlIHZlcmlmaWNhdGlvbjogaXMgYHByb29mYCB2YWxpZCBmb3IgYHB1Yl9zaWduYWxzYCB1bmRlciB0aGUgZW1iZWRkZWQgVks/ClJlYWQtb25seSwgY2hhbmdlcyBubyBzdGF0ZS4gVXNlZnVsIGZvciBjbGllbnRzL3Rlc3RzOyB0aGUgcmVhbCBmbG93IGlzCmBzdWJtaXRfcHJvb2ZgLCB3aGljaCBhbHNvIHNlYWxzIHRoZSByZXN1bHQuAAAAAAAADHZlcmlmeV9wcm9vZgAAAAIAAAAAAAAABXByb29mAAAAAAAH0AAAAAVQcm9vZgAAAAAAAAAAAAALcHViX3NpZ25hbHMAAAAD6gAAA+4AAAAgAAAAAQAAA+kAAAABAAAAAw==",
        "AAAAAAAAAJlSZWFkIGEgc2VhbGVkIGF0dGVzdGF0aW9uIGJ5IGlkICg9PSBudWxsaWZpZXIpLiBQb3dlcnMgdGhlIHB1YmxpYyAvcC86aWQgcGFnZQp3aXRoIFJFQUwgb24tY2hhaW4gc3RhdGUuIFJldHVybnMgTm9uZSBpZiBub3RoaW5nIHdhcyBzZWFsZWQgdW5kZXIgdGhhdCBpZC4AAAAAAAAPZ2V0X2F0dGVzdGF0aW9uAAAAAAEAAAAAAAAAAmlkAAAAAAPuAAAAIAAAAAEAAAPoAAAH0AAAAAtBdHRlc3RhdGlvbgA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    is_sealed: this.txFromJSON<boolean>,
        submit_proof: this.txFromJSON<Result<Buffer>>,
        verify_proof: this.txFromJSON<Result<boolean>>,
        get_attestation: this.txFromJSON<Option<Attestation>>
  }
}