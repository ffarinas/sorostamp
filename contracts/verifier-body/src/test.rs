//! Tests in two tiers:
//!   1. suffix/hash-completion logic — runs WITHOUT the VK (no curve points);
//!   2. REAL-proof tests against fixtures/bn254 (a genuine Zinli purchase proof
//!      from the production circuit + zkey), mirroring the header verifier's.

extern crate std;

use crate::sha256_resume::Resume;
use crate::{
    check_suffix, BodyVerifierBn254, BodyVerifierBn254Client, Error, Proof, IDX_BH_HI, IDX_BH_LO,
    IDX_CONSUMED, IDX_M2_HI, IDX_M2_LO, NUM_SIGNALS,
};
use ark_bn254::{Fq, Fq2, Fr};
use ark_ff::{BigInteger, PrimeField};
use core::str::FromStr;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use soroban_sdk::crypto::bn254::{
    Bn254G1Affine, Bn254G2Affine, BN254_G1_SERIALIZED_SIZE, BN254_G2_SERIALIZED_SIZE,
};
use soroban_sdk::{Bytes, BytesN, Env, Vec};
use std::vec::Vec as StdVec;

const IV_BYTES: [u8; 32] = [
    0x6a, 0x09, 0xe6, 0x67, 0xbb, 0x67, 0xae, 0x85, 0x3c, 0x6e, 0xf3, 0x72, 0xa5, 0x4f, 0xf5, 0x3a,
    0x51, 0x0e, 0x52, 0x7f, 0x9b, 0x05, 0x68, 0x8c, 0x1f, 0x83, 0xd9, 0xab, 0x5b, 0xe0, 0xcd, 0x19,
];

fn signal_from_hi_lo_part(env: &Env, part: &[u8]) -> BytesN<32> {
    // wrap a 16-byte half into a 32-byte field element (value in the low bytes)
    let mut b = [0u8; 32];
    b[16..].copy_from_slice(part);
    BytesN::from_array(env, &b)
}

/// Build the 28 public signals a real proof would carry for a synthetic "body":
/// hash the prefix+window with our own Resume (from the IV), take the midstate
/// as M2, and let sha2 provide the reference bh over the whole body.
fn build_signals(env: &Env, body: &[u8], consumed: usize) -> Vec<BytesN<32>> {
    assert!(consumed % 64 == 0);
    let mut r = Resume::new(IV_BYTES, 0);
    r.update(&body[..consumed]);
    let m2 = r.midstate();
    let bh: [u8; 32] = Sha256::digest(body).into();

    let mut signals = Vec::new(env);
    for i in 0..NUM_SIGNALS {
        let s = match i {
            _ if i == IDX_BH_HI => signal_from_hi_lo_part(env, &bh[..16]),
            _ if i == IDX_BH_LO => signal_from_hi_lo_part(env, &bh[16..]),
            _ if i == IDX_M2_HI => signal_from_hi_lo_part(env, &m2[..16]),
            _ if i == IDX_M2_LO => signal_from_hi_lo_part(env, &m2[16..]),
            _ if i == IDX_CONSUMED => {
                let mut b = [0u8; 32];
                b[24..].copy_from_slice(&(consumed as u64).to_be_bytes());
                BytesN::from_array(env, &b)
            }
            // nullifier / from / fact chunks are irrelevant to check_suffix
            _ => BytesN::from_array(env, &[0u8; 32]),
        };
        signals.push_back(s);
    }
    signals
}

fn synthetic_body(len: usize) -> StdVec<u8> {
    (0..len as u32).map(|i| (i.wrapping_mul(2_654_435_761) >> 24) as u8).collect()
}

#[test]
fn suffix_completion_accepts_the_true_tail() {
    let env = Env::default();
    // 25 KB suffix — the realistic Zinli shape (facts ~24.4 KB before body end)
    let body = synthetic_body(1536 + 25_533);
    let consumed = 1536;
    let signals = build_signals(&env, &body, consumed);
    let suffix = Bytes::from_slice(&env, &body[consumed..]);
    assert_eq!(check_suffix(&env, &signals, &suffix), Ok(()));
}

#[test]
fn suffix_completion_accepts_an_empty_tail() {
    let env = Env::default();
    // facts at the very end of the body: suffix is empty, padding-only finish
    let body = synthetic_body(1536);
    let signals = build_signals(&env, &body, 1536);
    let suffix = Bytes::new(&env);
    assert_eq!(check_suffix(&env, &signals, &suffix), Ok(()));
}

#[test]
fn tampered_suffix_is_rejected() {
    let env = Env::default();
    let body = synthetic_body(1536 + 4096);
    let signals = build_signals(&env, &body, 1536);

    let mut tampered = body[1536..].to_vec();
    tampered[100] ^= 0x01;
    let suffix = Bytes::from_slice(&env, &tampered);
    assert_eq!(check_suffix(&env, &signals, &suffix), Err(Error::SuffixMismatch));
}

#[test]
fn truncated_and_extended_suffixes_are_rejected() {
    let env = Env::default();
    let body = synthetic_body(1536 + 4096);
    let signals = build_signals(&env, &body, 1536);

    let truncated = Bytes::from_slice(&env, &body[1536..body.len() - 64]);
    assert_eq!(check_suffix(&env, &signals, &truncated), Err(Error::SuffixMismatch));

    let mut extended = body[1536..].to_vec();
    extended.extend_from_slice(&[0u8; 64]);
    let extended = Bytes::from_slice(&env, &extended);
    assert_eq!(check_suffix(&env, &signals, &extended), Err(Error::SuffixMismatch));
}

#[test]
fn wrong_consumed_claims_are_rejected() {
    let env = Env::default();
    let body = synthetic_body(1536 + 4096);
    let suffix = Bytes::from_slice(&env, &body[1536..]);

    // unaligned
    let mut signals = build_signals(&env, &body, 1536);
    let mut b = [0u8; 32];
    b[24..].copy_from_slice(&1500u64.to_be_bytes());
    signals.set(IDX_CONSUMED, BytesN::from_array(&env, &b));
    assert_eq!(check_suffix(&env, &signals, &suffix), Err(Error::BadConsumed));

    // zero (no window at all)
    let mut b0 = [0u8; 32];
    b0[24..].copy_from_slice(&0u64.to_be_bytes());
    let mut signals0 = build_signals(&env, &body, 1536);
    signals0.set(IDX_CONSUMED, BytesN::from_array(&env, &b0));
    assert_eq!(check_suffix(&env, &signals0, &suffix), Err(Error::BadConsumed));

    // aligned but LYING about the length: padding encodes the wrong total → digest ≠ bh
    let mut b2 = [0u8; 32];
    b2[24..].copy_from_slice(&(1536u64 + 64).to_be_bytes());
    let mut signals2 = build_signals(&env, &body, 1536);
    signals2.set(IDX_CONSUMED, BytesN::from_array(&env, &b2));
    assert_eq!(check_suffix(&env, &signals2, &suffix), Err(Error::SuffixMismatch));
}

#[test]
fn tampered_midstate_is_rejected() {
    let env = Env::default();
    let body = synthetic_body(1536 + 4096);
    let mut signals = build_signals(&env, &body, 1536);
    // flip a bit in M2 — models a prover claiming a different window
    let mut m2_hi = signals.get(IDX_M2_HI).unwrap().to_array();
    m2_hi[31] ^= 0x01;
    signals.set(IDX_M2_HI, BytesN::from_array(&env, &m2_hi));
    let suffix = Bytes::from_slice(&env, &body[1536..]);
    assert_eq!(check_suffix(&env, &signals, &suffix), Err(Error::SuffixMismatch));
}

/* ═══════════ tier 2 — REAL proof fixtures (Zinli purchase) ═══════════ */

#[derive(Deserialize)]
struct ProofJson {
    pi_a: [std::string::String; 3],
    pi_b: [[std::string::String; 2]; 3],
    pi_c: [std::string::String; 3],
}

fn fq_to_bytes_be(fq: &Fq) -> [u8; 32] {
    let bytes = fq.into_bigint().to_bytes_be();
    let mut out = [0u8; 32];
    let start = out.len().saturating_sub(bytes.len());
    out[start..].copy_from_slice(&bytes);
    out
}

fn g1_from_coords(env: &Env, x: &str, y: &str) -> Bn254G1Affine {
    let ark_g1 = ark_bn254::G1Affine::new(Fq::from_str(x).unwrap(), Fq::from_str(y).unwrap());
    let mut buf = [0u8; BN254_G1_SERIALIZED_SIZE];
    buf[..32].copy_from_slice(&fq_to_bytes_be(&ark_g1.x));
    buf[32..].copy_from_slice(&fq_to_bytes_be(&ark_g1.y));
    Bn254G1Affine::from_array(env, &buf)
}

fn g2_from_coords(env: &Env, x1: &str, x2: &str, y1: &str, y2: &str) -> Bn254G2Affine {
    let x = Fq2::new(Fq::from_str(x1).unwrap(), Fq::from_str(x2).unwrap());
    let y = Fq2::new(Fq::from_str(y1).unwrap(), Fq::from_str(y2).unwrap());
    let ark_g2 = ark_bn254::G2Affine::new(x, y);
    let mut buf = [0u8; BN254_G2_SERIALIZED_SIZE];
    buf[0..32].copy_from_slice(&fq_to_bytes_be(&ark_g2.x.c1));
    buf[32..64].copy_from_slice(&fq_to_bytes_be(&ark_g2.x.c0));
    buf[64..96].copy_from_slice(&fq_to_bytes_be(&ark_g2.y.c1));
    buf[96..128].copy_from_slice(&fq_to_bytes_be(&ark_g2.y.c0));
    Bn254G2Affine::from_array(env, &buf)
}

fn signal_bytes(env: &Env, decimal: &str) -> BytesN<32> {
    let fr = Fr::from_str(decimal).unwrap();
    let bytes = fr.into_bigint().to_bytes_be();
    let mut out = [0u8; 32];
    let start = out.len().saturating_sub(bytes.len());
    out[start..].copy_from_slice(&bytes);
    BytesN::from_array(env, &out)
}

fn create_client(e: &Env) -> BodyVerifierBn254Client<'_> {
    let contract_id = e.register(BodyVerifierBn254 {}, ());
    BodyVerifierBn254Client::new(e, &contract_id)
}

fn load_fixtures(env: &Env) -> (Proof, Vec<BytesN<32>>, Bytes) {
    let proof_json: ProofJson =
        serde_json::from_str(include_str!("../fixtures/bn254/proof.json")).unwrap();
    let proof = Proof {
        a: g1_from_coords(env, &proof_json.pi_a[0], &proof_json.pi_a[1]),
        b: g2_from_coords(
            env,
            &proof_json.pi_b[0][0],
            &proof_json.pi_b[0][1],
            &proof_json.pi_b[1][0],
            &proof_json.pi_b[1][1],
        ),
        c: g1_from_coords(env, &proof_json.pi_c[0], &proof_json.pi_c[1]),
    };
    let signals: StdVec<std::string::String> =
        serde_json::from_str(include_str!("../fixtures/bn254/public.json")).unwrap();
    assert_eq!(signals.len() as u32, NUM_SIGNALS);
    let mut pub_signals = Vec::new(env);
    for s in &signals {
        pub_signals.push_back(signal_bytes(env, s));
    }
    let suffix = Bytes::from_slice(env, include_bytes!("../fixtures/bn254/suffix.bin"));
    (proof, pub_signals, suffix)
}

#[test]
fn real_purchase_proof_verifies() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let client = create_client(&env);
    let (proof, pub_signals, suffix) = load_fixtures(&env);
    assert!(client.verify_proof(&proof, &pub_signals, &suffix));
}

#[test]
fn real_purchase_proof_seals_and_replay_is_rejected() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let client = create_client(&env);
    let (proof, pub_signals, suffix) = load_fixtures(&env);

    let id = client.seal_body(&proof, &pub_signals, &suffix);
    assert_eq!(id, pub_signals.get(0).unwrap());

    let att = client.get_attestation(&id).unwrap();
    assert_eq!(att.nullifier, id);
    assert!(client.is_sealed(&id));

    // replaying the same email must hit the anti-replay wall
    let replay = client.try_seal_body(&proof, &pub_signals, &suffix);
    assert_eq!(replay, Err(Ok(Error::AlreadySealed)));
}

#[test]
fn real_proof_with_tampered_suffix_is_rejected() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let client = create_client(&env);
    let (proof, pub_signals, suffix) = load_fixtures(&env);

    let mut bytes = std::vec![0u8; suffix.len() as usize];
    suffix.copy_into_slice(&mut bytes);
    bytes[1000] ^= 0x01;
    let tampered = Bytes::from_slice(&env, &bytes);
    let r = client.try_seal_body(&proof, &pub_signals, &tampered);
    assert_eq!(r, Err(Ok(Error::SuffixMismatch)));
}

#[test]
fn real_proof_with_tampered_fact_is_rejected() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let client = create_client(&env);
    let (proof, pub_signals, suffix) = load_fixtures(&env);

    // flip a byte in the first fact chunk (signal 10): the pairing must fail
    let mut sig10 = pub_signals.get(10).unwrap().to_array();
    sig10[31] ^= 0x01;
    let mut tampered = pub_signals.clone();
    tampered.set(10, BytesN::from_array(&env, &sig10));
    let r = client.try_seal_body(&proof, &tampered, &suffix);
    assert_eq!(r, Err(Ok(Error::InvalidProof)));
}

/// Not an assertion — prints the metered cost of a real seal_body so we know
/// the 29-point MSM + 24 KB SHA completion fits Soroban's per-tx budget.
#[test]
fn print_seal_body_cost() {
    let env = Env::default();
    let client = create_client(&env);
    let (proof, pub_signals, suffix) = load_fixtures(&env);
    env.cost_estimate().budget().reset_unlimited();
    client.seal_body(&proof, &pub_signals, &suffix);
    std::println!("{:?}", env.cost_estimate().budget());
}
