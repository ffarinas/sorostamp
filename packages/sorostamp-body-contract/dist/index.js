import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from "@stellar/stellar-sdk/contract";
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
    1: { message: "MalformedVerifyingKey" },
    /**
     * no public signals supplied (we need at least the nullifier at index 0)
     */
    2: { message: "NoPublicSignals" },
    /**
     * the Groth16 pairing check failed — the proof is not valid for this VK
     */
    3: { message: "InvalidProof" },
    /**
     * this email/proof was already sealed (nullifier seen before) — anti-replay
     */
    4: { message: "AlreadySealed" },
    /**
     * a public signal is >= the BN254 scalar field modulus (non-canonical encoding)
     */
    5: { message: "FieldElementNotCanonical" },
    /**
     * resuming SHA-256 over the public suffix did not reproduce the DKIM bh=
     */
    6: { message: "SuffixMismatch" },
    /**
     * consumedBytes is not block-aligned or too small to contain a window
     */
    7: { message: "BadConsumed" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy(null, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAADxwdWJsaWMtc2lnbmFsIGNvdW50IGRvZXNuJ3QgbWF0Y2ggdGhlIGVtYmVkZGVkIHZlcmlmeWluZyBrZXkAAAAVTWFsZm9ybWVkVmVyaWZ5aW5nS2V5AAAAAAAAAQAAAEZubyBwdWJsaWMgc2lnbmFscyBzdXBwbGllZCAod2UgbmVlZCBhdCBsZWFzdCB0aGUgbnVsbGlmaWVyIGF0IGluZGV4IDApAAAAAAAPTm9QdWJsaWNTaWduYWxzAAAAAAIAAABHdGhlIEdyb3RoMTYgcGFpcmluZyBjaGVjayBmYWlsZWQg4oCUIHRoZSBwcm9vZiBpcyBub3QgdmFsaWQgZm9yIHRoaXMgVksAAAAADEludmFsaWRQcm9vZgAAAAMAAABLdGhpcyBlbWFpbC9wcm9vZiB3YXMgYWxyZWFkeSBzZWFsZWQgKG51bGxpZmllciBzZWVuIGJlZm9yZSkg4oCUIGFudGktcmVwbGF5AAAAAA1BbHJlYWR5U2VhbGVkAAAAAAAABAAAAE1hIHB1YmxpYyBzaWduYWwgaXMgPj0gdGhlIEJOMjU0IHNjYWxhciBmaWVsZCBtb2R1bHVzIChub24tY2Fub25pY2FsIGVuY29kaW5nKQAAAAAAABhGaWVsZEVsZW1lbnROb3RDYW5vbmljYWwAAAAFAAAARnJlc3VtaW5nIFNIQS0yNTYgb3ZlciB0aGUgcHVibGljIHN1ZmZpeCBkaWQgbm90IHJlcHJvZHVjZSB0aGUgREtJTSBiaD0AAAAAAA5TdWZmaXhNaXNtYXRjaAAAAAAABgAAAENjb25zdW1lZEJ5dGVzIGlzIG5vdCBibG9jay1hbGlnbmVkIG9yIHRvbyBzbWFsbCB0byBjb250YWluIGEgd2luZG93AAAAAAtCYWRDb25zdW1lZAAAAAAH",
            "AAAAAQAAAAAAAAAAAAAABVByb29mAAAAAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==",
            "AAAABQAAAAAAAAAAAAAABlNlYWxlZAAAAAAAAQAAAAZzZWFsZWQAAAAAAAIAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAQAAAAAAAAAOc3RhdGVtZW50X2hhc2gAAAAAA+4AAAAgAAAAAAAAAAI=",
            "AAAAAQAAAJFTYW1lIHNoYXBlIGFzIHRoZSBoZWFkZXIgdmVyaWZpZXIncyBhdHRlc3RhdGlvbiBzbyBldmVyeSByZWFkZXIgKHNlcnZlcgpyb3V0ZSwgY2xpZW50IGZhbGxiYWNrLCAvcCBwYWdlKSB3b3JrcyBhZ2FpbnN0IGVpdGhlciBjb250cmFjdCB1bmNoYW5nZWQuAAAAAAAAAAAAAAtBdHRlc3RhdGlvbgAAAAAEAAAAAAAAAAZsZWRnZXIAAAAAAAQAAAAAAAAACW51bGxpZmllcgAAAAAAA+4AAAAgAAAAAAAAAA5zdGF0ZW1lbnRfaGFzaAAAAAAD7gAAACAAAAAAAAAACXRpbWVzdGFtcAAAAAAAAAY=",
            "AAAAAQAAAAAAAAAAAAAAD1ZlcmlmaWNhdGlvbktleQAAAAAFAAAAAAAAAAVhbHBoYQAAAAAAA+4AAABAAAAAAAAAAARiZXRhAAAD7gAAAIAAAAAAAAAABWRlbHRhAAAAAAAD7gAAAIAAAAAAAAAABWdhbW1hAAAAAAAD7gAAAIAAAAAAAAAAAmljAAAAAAPqAAAD7gAAAEA=",
            "AAAAAAAAAAAAAAAJaXNfc2VhbGVkAAAAAAAAAQAAAAAAAAAJbnVsbGlmaWVyAAAAAAAD7gAAACAAAAABAAAAAQ==",
            "AAAAAAAAAdJWZXJpZnkgYSBib2R5IHByb29mIEFORCBzZWFsIGl0IGFzIGEgcHVibGljIGF0dGVzdGF0aW9uLgoKQ2hlY2sgb3JkZXIgaXMgY2hlYXAtdG8tZXhwZW5zaXZlIChjYW5vbmljYWwgZm9ybSDihpIgcmVwbGF5IOKGkiBTSEEgb3ZlciB0aGUKc3VmZml4IOKGkiBwYWlyaW5nKSBzbyBpbnZhbGlkIHN1Ym1pc3Npb25zIGNvc3QgdGhlIHNwb25zb3IgYXMgbGl0dGxlIGFzCnBvc3NpYmxlOyBub3RoaW5nIGlzIHBlcnNpc3RlZCB1bnRpbCBldmVyeSBjaGVjayBoYXMgcGFzc2VkLgoKTk9URTogYHN1ZmZpeGAgcmlkZXMgaW4gdGhlIHRyYW5zYWN0aW9uLCBzbyBpdCBpcyBwdWJsaWMgZm9yZXZlciBpbiB0aGUKbGVkZ2VyIGhpc3RvcnkuIFRoZSBjbGllbnQgYXVkaXRzIGl0IGZvciBwZXJzb25hbCBkYXRhIGFuZCBzaG93cyB0aGUgdXNlcgpleGFjdGx5IHdoYXQgd2lsbCBiZSBwdWJsaXNoZWQgYmVmb3JlIHN1Ym1pdHRpbmcuAAAAAAAJc2VhbF9ib2R5AAAAAAAAAwAAAAAAAAAFcHJvb2YAAAAAAAfQAAAABVByb29mAAAAAAAAAAAAAAtwdWJfc2lnbmFscwAAAAPqAAAD7gAAACAAAAAAAAAABnN1ZmZpeAAAAAAADgAAAAEAAAPpAAAD7gAAACAAAAAD",
            "AAAAAAAAAIpQdXJlIHZlcmlmaWNhdGlvbiBvZiBwcm9vZiArIHN1ZmZpeCwgbm8gc3RhdGUgY2hhbmdlLiBSZXR1cm5zIHRydWUgb25seQppZiBCT1RIIHRoZSBwYWlyaW5nIGNoZWNrIGFuZCB0aGUgU0hBIGNvbXBsZXRpb24gYWdhaW5zdCBiaD0gcGFzcy4AAAAAAAx2ZXJpZnlfcHJvb2YAAAADAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAFUHJvb2YAAAAAAAAAAAAAC3B1Yl9zaWduYWxzAAAAA+oAAAPuAAAAIAAAAAAAAAAGc3VmZml4AAAAAAAOAAAAAQAAA+kAAAABAAAAAw==",
            "AAAAAAAAAIdSZWFkIGEgc2VhbGVkIGF0dGVzdGF0aW9uIGJ5IGlkICg9PSBudWxsaWZpZXIpIOKAlCBzYW1lIEFCSSBhcyB0aGUgaGVhZGVyCnZlcmlmaWVyIHNvIHRoZSAvcCBwYWdlIHJlYWRlcnMgd29yayBhZ2FpbnN0IGVpdGhlciBjb250cmFjdC4AAAAAD2dldF9hdHRlc3RhdGlvbgAAAAABAAAAAAAAAAJpZAAAAAAD7gAAACAAAAABAAAD6AAAB9AAAAALQXR0ZXN0YXRpb24A"]), options);
        this.options = options;
    }
    fromJSON = {
        is_sealed: (this.txFromJSON),
        seal_body: (this.txFromJSON),
        verify_proof: (this.txFromJSON),
        get_attestation: (this.txFromJSON)
    };
}
