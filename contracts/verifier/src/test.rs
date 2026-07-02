extern crate std;

use ark_bn254::{Fq, Fq2, Fr};
use ark_ff::{BigInteger, PrimeField};
use core::str::FromStr;
use serde::Deserialize;
use soroban_sdk::{
    BytesN, Env, Vec,
    crypto::bn254::{
        BN254_G1_SERIALIZED_SIZE, BN254_G2_SERIALIZED_SIZE, Bn254G1Affine, Bn254G2Affine,
    },
};

use crate::{Error, Groth16VerifierBn254, Groth16VerifierBn254Client, Proof};

/// snarkjs `proof.json`. The real circuit emits the proof here and the public
/// signals in a SEPARATE `public.json`, so there is no `publicSignals` field.
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

/// A snarkjs public signal is a field element (a ~77-digit decimal string). On-chain
/// we hand it in as a 32-byte big-endian scalar: parse into Fr, then serialize the
/// canonical big-integer big-endian, left-padded to 32 bytes.
fn signal_bytes(env: &Env, decimal: &str) -> BytesN<32> {
    let fr = Fr::from_str(decimal).unwrap();
    let bytes = fr.into_bigint().to_bytes_be();
    let mut out = [0u8; 32];
    let start = out.len().saturating_sub(bytes.len());
    out[start..].copy_from_slice(&bytes);
    BytesN::from_array(env, &out)
}

fn create_client(e: &Env) -> Groth16VerifierBn254Client<'_> {
    let contract_id = e.register(Groth16VerifierBn254 {}, ());
    Groth16VerifierBn254Client::new(e, &contract_id)
}

/// Load the REAL proof from `proof.json` and the REAL 5 public signals
/// (nullifier, subject0, subject1, subject2, subject3) from `public.json`.
fn load_proof_and_public_signals(env: &Env) -> (Proof, Vec<BytesN<32>>) {
    let proof_json_str = include_str!("../fixtures/bn254/proof.json");
    let proof_json: ProofJson = serde_json::from_str(proof_json_str).unwrap();

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

    let public_json_str = include_str!("../fixtures/bn254/public.json");
    let signals: std::vec::Vec<std::string::String> =
        serde_json::from_str(public_json_str).unwrap();

    let mut output = Vec::new(env);
    for s in &signals {
        output.push_back(signal_bytes(env, s));
    }
    (proof, output)
}

// ── Pure verification ─────────────────────────────────────────────

#[test]
fn accepts_valid_proof_with_expected_public_signals() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    // the real 5-signal proof verifies under the real embedded VK
    assert_eq!(output.len(), 5);
    let res = client.verify_proof(&proof, &output);
    assert_eq!(res, true);
}

#[test]
fn rejects_valid_proof_with_wrong_public_signals() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    // keep the right LENGTH (5) so we reach the pairing, but corrupt one signal: the
    // proof no longer attests to these inputs, so the Groth16 check must fail.
    let mut wrong = output.clone();
    wrong.set(0, signal_bytes(&env, "22"));
    let res = client.verify_proof(&proof, &wrong);
    assert_eq!(res, false);
}

#[test]
fn errors_when_public_signal_length_does_not_match_vk() {
    let env = Env::default();
    let (proof, _) = load_proof_and_public_signals(&env);

    // VK expects exactly 5 public signals (IC has 6 points). A Vec of the wrong length
    // is rejected before any cryptography runs.
    let res = Groth16VerifierBn254::verify_proof(env.clone(), proof, Vec::new(&env));
    assert_eq!(res, Err(Error::MalformedVerifyingKey));
}

// ── Sealing + attestation + anti-replay ───────────────────────────

#[test]
fn submit_seals_an_attestation_and_exposes_it() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    let nullifier = output.get(0).unwrap();

    // before: nothing sealed
    assert_eq!(client.is_sealed(&nullifier), false);
    assert_eq!(client.get_attestation(&nullifier), None);

    // seal it — returns the attestation id (== nullifier)
    let id = client.submit_proof(&proof, &output);
    assert_eq!(id, nullifier);

    // after: readable on-chain state for /p/:id
    assert_eq!(client.is_sealed(&nullifier), true);
    let att = client.get_attestation(&id).unwrap();
    assert_eq!(att.nullifier, nullifier);
    // statement_hash is a real domain-separated sha256 commitment (non-zero)
    assert_ne!(att.statement_hash, BytesN::from_array(&env, &[0u8; 32]));
}

#[test]
fn the_same_email_cannot_be_sealed_twice() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    // first seal succeeds
    client.submit_proof(&proof, &output);
    // replaying the SAME proof/nullifier is rejected
    let replay = client.try_submit_proof(&proof, &output);
    assert!(replay.is_err());
}

#[test]
fn submit_rejects_an_invalid_proof() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    // 5 signals the proof does NOT attest to (corrupt the nullifier) → pairing fails →
    // InvalidProof, and nothing is sealed under the corrupted nullifier.
    let mut wrong = output.clone();
    let wrong_nullifier = signal_bytes(&env, "22");
    wrong.set(0, wrong_nullifier.clone());
    let res = client.try_submit_proof(&proof, &wrong);
    assert!(res.is_err());
    assert_eq!(client.is_sealed(&wrong_nullifier), false);
}

// ── Audit fixes: canonicity + cheap replay rejection ──────────────

#[test]
fn rejects_non_canonical_field_element() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    // Take the REAL nullifier (signal[0]) and add r to its bytes. As a FIELD ELEMENT this
    // equals the real nullifier (so the pairing would still pass), but its bytes are
    // non-canonical (>= r). That is exactly the malleability / anti-replay-bypass vector —
    // the contract must refuse it outright, before any pairing.
    let real_nullifier = output.get(0).unwrap().to_array();
    let non_canonical_bytes = add_be_32(&real_nullifier, &crate::FR_MODULUS);
    let mut non_canonical = output.clone();
    non_canonical.set(0, BytesN::from_array(&env, &non_canonical_bytes));

    assert!(client.try_verify_proof(&proof, &non_canonical).is_err());
    assert!(client.try_submit_proof(&proof, &non_canonical).is_err());
    // nothing was sealed under those bytes
    assert_eq!(
        client.is_sealed(&BytesN::from_array(&env, &non_canonical_bytes)),
        false
    );
}

#[test]
fn replay_is_rejected_cheaply_before_the_pairing() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    client.submit_proof(&proof, &output); // first seal pays for the pairing

    env.cost_estimate().budget().reset_default();
    let replay = client.try_submit_proof(&proof, &output);
    assert!(replay.is_err());

    // Rejecting a known nullifier must cost a storage read, NOT a ~25.6M-CPU pairing.
    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    std::println!("replay rejection cpu = {}", cpu);
    assert!(cpu < 5_000_000);
}

// ── Budget (prices the sponsored gas model) ───────────────────────

// Pure verification cost.
#[test]
fn budget_of_verify_proof() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    env.cost_estimate().budget().reset_default();
    let res = client.verify_proof(&proof, &output);
    assert_eq!(res, true);

    let budget = env.cost_estimate().budget();
    std::println!("=== verify_proof budget (5 public inputs) ===");
    std::println!(
        "cpu_insns = {}, mem_bytes = {}",
        budget.cpu_instruction_cost(),
        budget.memory_bytes_cost()
    );
}

// Full sealed submit cost (verify + nullifier check + persist) — this is the tx
// Lacre actually sponsors, so this is the real number for the gas model.
#[test]
fn budget_of_submit_proof() {
    let env = Env::default();
    let (proof, output) = load_proof_and_public_signals(&env);
    let client = create_client(&env);

    env.cost_estimate().budget().reset_default();
    client.submit_proof(&proof, &output);

    let budget = env.cost_estimate().budget();
    std::println!("=== submit_proof budget (verify + seal) ===");
    std::println!(
        "cpu_insns = {}, mem_bytes = {}",
        budget.cpu_instruction_cost(),
        budget.memory_bytes_cost()
    );
}

/// Add two 32-byte big-endian integers. Used only to build the `signal + r` non-canonical
/// test vector; the inputs here are small enough (signal < r < 2^254) that the sum never
/// overflows 32 bytes.
fn add_be_32(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let mut carry = 0u16;
    for i in (0..32).rev() {
        let sum = a[i] as u16 + b[i] as u16 + carry;
        out[i] = (sum & 0xff) as u8;
        carry = sum >> 8;
    }
    out
}
