import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, u64, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CB3CYN27C3ATTI7GXDRSD5A5MMTKA5L5SB2A4RE32H3FPOKT3E2GWODV";
    };
};
export declare const Errors: {
    /**
     * public-signal count doesn't match the embedded verifying key
     */
    1: {
        message: string;
    };
    /**
     * no public signals supplied (we need at least the nullifier at index 0)
     */
    2: {
        message: string;
    };
    /**
     * the Groth16 pairing check failed — the proof is not valid for this VK
     */
    3: {
        message: string;
    };
    /**
     * this email/proof was already sealed (nullifier seen before) — anti-replay
     */
    4: {
        message: string;
    };
    /**
     * a public signal is >= the BN254 scalar field modulus (non-canonical encoding)
     */
    5: {
        message: string;
    };
};
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
    is_sealed: ({ nullifier }: {
        nullifier: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
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
    submit_proof: ({ proof, pub_signals }: {
        proof: Proof;
        pub_signals: Array<Buffer>;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>;
    /**
     * Construct and simulate a verify_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Pure verification: is `proof` valid for `pub_signals` under the embedded VK?
     * Read-only, changes no state. Useful for clients/tests; the real flow is
     * `submit_proof`, which also seals the result.
     */
    verify_proof: ({ proof, pub_signals }: {
        proof: Proof;
        pub_signals: Array<Buffer>;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>;
    /**
     * Construct and simulate a get_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Read a sealed attestation by id (== nullifier). Powers the public /p/:id page
     * with REAL on-chain state. Returns None if nothing was sealed under that id.
     */
    get_attestation: ({ id }: {
        id: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Option<Attestation>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        is_sealed: (json: string) => AssembledTransaction<boolean>;
        submit_proof: (json: string) => AssembledTransaction<Result<Buffer<ArrayBufferLike>, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        verify_proof: (json: string) => AssembledTransaction<Result<boolean, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_attestation: (json: string) => AssembledTransaction<Option<Attestation>>;
    };
}
