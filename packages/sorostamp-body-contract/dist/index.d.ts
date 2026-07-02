import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { u32, u64, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
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
    /**
     * resuming SHA-256 over the public suffix did not reproduce the DKIM bh=
     */
    6: {
        message: string;
    };
    /**
     * consumedBytes is not block-aligned or too small to contain a window
     */
    7: {
        message: string;
    };
};
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
    is_sealed: ({ nullifier }: {
        nullifier: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
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
    seal_body: ({ proof, pub_signals, suffix }: {
        proof: Proof;
        pub_signals: Array<Buffer>;
        suffix: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>;
    /**
     * Construct and simulate a verify_proof transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Pure verification of proof + suffix, no state change. Returns true only
     * if BOTH the pairing check and the SHA completion against bh= pass.
     */
    verify_proof: ({ proof, pub_signals, suffix }: {
        proof: Proof;
        pub_signals: Array<Buffer>;
        suffix: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>;
    /**
     * Construct and simulate a get_attestation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Read a sealed attestation by id (== nullifier) — same ABI as the header
     * verifier so the /p page readers work against either contract.
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
        seal_body: (json: string) => AssembledTransaction<Result<Buffer<ArrayBufferLike>, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        verify_proof: (json: string) => AssembledTransaction<Result<boolean, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        get_attestation: (json: string) => AssembledTransaction<Option<Attestation>>;
    };
}
