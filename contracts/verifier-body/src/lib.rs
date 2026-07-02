#![no_std]
//! Sorostamp body-fact verifier — Groth16/BN254 + on-chain SHA-256 completion.
//!
//! The companion circuit (sorostamp_body.circom) proves, in zero knowledge:
//!   - the DKIM signature over the email header verifies,
//!   - `bh=` (the body-hash commitment) extracted from that signed header,
//!   - a SHA-256 midstate chain M1 --window--> M2 where the window holds the
//!     revealed facts (amount / merchant / reference, label+value together).
//!
//! What the circuit CANNOT see is everything AFTER the window (~24 KB of mail
//! template). That arrives here as the public `suffix`: this contract resumes
//! SHA-256 from M2, absorbs the suffix, pads for the full body length, and
//! requires digest == bh. Faking any part needs a free-start second preimage
//! of SHA-256. The prefix (before the window) stays private behind M1.
//!
//! Public-signal ABI (29 IC points):
//!   [0]      nullifier        poseidon(poseidon(dkim signature)) — anti-replay
//!   [1..=4]  fromChunks       revealed From header (packed 31 bytes/field)
//!   [5],[6]  bhHi, bhLo       DKIM bh=, two 128-bit BE halves
//!   [7],[8]  m2Hi, m2Lo       midstate after the window, same packing
//!   [9]      consumedBytes    prefix+window bytes (block-aligned)
//!   [10..=27] factChunks 3×6  revealed body spans (packed 31 bytes/field)

#[cfg(test)]
#[path = "test.rs"]
mod proof_test;

mod sha256_resume;
mod vk_bytes;

use sha256_resume::Resume;
use soroban_sdk::{
    Bytes, BytesN, Env, U256, Vec, contract, contractevent, contracterror, contractimpl,
    contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
};
use vk_bytes::{VK_ALPHA, VK_BETA, VK_DELTA, VK_GAMMA, VK_IC};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// public-signal count doesn't match the embedded verifying key
    MalformedVerifyingKey = 1,
    /// no public signals supplied (we need at least the nullifier at index 0)
    NoPublicSignals = 2,
    /// the Groth16 pairing check failed — the proof is not valid for this VK
    InvalidProof = 3,
    /// this email/proof was already sealed (nullifier seen before) — anti-replay
    AlreadySealed = 4,
    /// a public signal is >= the BN254 scalar field modulus (non-canonical encoding)
    FieldElementNotCanonical = 5,
    /// resuming SHA-256 over the public suffix did not reproduce the DKIM bh=
    SuffixMismatch = 6,
    /// consumedBytes is not block-aligned or too small to contain a window
    BadConsumed = 7,
}

/// Where each piece of the statement lives in `pub_signals` — must match the
/// output order of sorostamp_body.circom exactly.
const NUM_SIGNALS: u32 = 28;
const IDX_BH_HI: u32 = 5;
const IDX_BH_LO: u32 = 6;
const IDX_M2_HI: u32 = 7;
const IDX_M2_LO: u32 = 8;
const IDX_CONSUMED: u32 = 9;

#[derive(Clone)]
#[contracttype]
pub struct VerificationKey {
    pub alpha: Bn254G1Affine,
    pub beta: Bn254G2Affine,
    pub gamma: Bn254G2Affine,
    pub delta: Bn254G2Affine,
    pub ic: Vec<Bn254G1Affine>,
}

#[derive(Clone)]
#[contracttype]
pub struct Proof {
    pub a: Bn254G1Affine,
    pub b: Bn254G2Affine,
    pub c: Bn254G1Affine,
}

/// Same shape as the header verifier's attestation so every reader (server
/// route, client fallback, /p page) works against either contract unchanged.
#[derive(Clone, Debug, PartialEq, Eq)]
#[contracttype]
pub struct Attestation {
    pub nullifier: BytesN<32>,
    pub statement_hash: BytesN<32>,
    pub ledger: u32,
    pub timestamp: u64,
}

#[contractevent]
pub struct Sealed {
    #[topic]
    pub nullifier: BytesN<32>,
    pub statement_hash: BytesN<32>,
}

#[contracttype]
enum DataKey {
    Att(BytesN<32>),
}

const DAY_LEDGERS: u32 = 17_280; // ~5s/ledger
const ATT_TTL: u32 = DAY_LEDGERS * 90;
const ATT_TTL_THRESHOLD: u32 = DAY_LEDGERS * 80;

pub(crate) const FR_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

// Distinct domain tag: the body layout must never hash-collide with the header
// verifier's statements.
const DOMAIN_TAG: &[u8] = b"LACRE_ATTESTATION_BODY_V1";

fn vk(env: &Env) -> VerificationKey {
    let alpha = Bn254G1Affine::from_array(env, &VK_ALPHA);
    let beta = Bn254G2Affine::from_array(env, &VK_BETA);
    let gamma = Bn254G2Affine::from_array(env, &VK_GAMMA);
    let delta = Bn254G2Affine::from_array(env, &VK_DELTA);

    let mut ic = Vec::new(env);
    for p in VK_IC.iter() {
        ic.push_back(Bn254G1Affine::from_array(env, p));
    }

    VerificationKey { alpha, beta, gamma, delta, ic }
}

fn fr_from_bytes(env: &Env, b: &BytesN<32>) -> Bn254Fr {
    let u = U256::from_be_bytes(env, &Bytes::from_array(env, &b.to_array()));
    Bn254Fr::from_u256(u)
}

fn ensure_canonical(env: &Env, pub_signals: &Vec<BytesN<32>>) -> Result<(), Error> {
    let modulus = U256::from_be_bytes(env, &Bytes::from_array(env, &FR_MODULUS));
    for s in pub_signals.iter() {
        let u = U256::from_be_bytes(env, &Bytes::from_array(env, &s.to_array()));
        if u >= modulus {
            return Err(Error::FieldElementNotCanonical);
        }
    }
    Ok(())
}

fn hash_statement(env: &Env, pub_signals: &Vec<BytesN<32>>) -> BytesN<32> {
    let mut pre = Bytes::from_slice(env, DOMAIN_TAG);
    for s in pub_signals.iter().skip(1) {
        pre.append(&Bytes::from_array(env, &s.to_array()));
    }
    env.crypto().sha256(&pre).to_bytes()
}

/// Reassemble a 32-byte value from its hi/lo public signals. The circuit packs
/// each half as a 128-bit BE integer, so as field elements the top 16 bytes are
/// zero and the value sits in the low 16.
fn bytes32_from_hi_lo(hi: &BytesN<32>, lo: &BytesN<32>) -> [u8; 32] {
    let h = hi.to_array();
    let l = lo.to_array();
    let mut out = [0u8; 32];
    out[..16].copy_from_slice(&h[16..]);
    out[16..].copy_from_slice(&l[16..]);
    out
}

/// Resume SHA-256 from the proven midstate M2 over the public suffix and check
/// the completed digest against the DKIM bh= the circuit pulled out of the
/// signed header. This is what binds the revealed window to THIS email's body.
fn check_suffix(env: &Env, pub_signals: &Vec<BytesN<32>>, suffix: &Bytes) -> Result<(), Error> {
    let _ = env;
    let consumed_bytes = pub_signals.get(IDX_CONSUMED).unwrap().to_array();
    let consumed = u64::from_be_bytes(consumed_bytes[24..32].try_into().unwrap());
    if consumed % 64 != 0 || consumed < 64 {
        return Err(Error::BadConsumed);
    }

    let m2 = bytes32_from_hi_lo(
        &pub_signals.get(IDX_M2_HI).unwrap(),
        &pub_signals.get(IDX_M2_LO).unwrap(),
    );
    let bh = bytes32_from_hi_lo(
        &pub_signals.get(IDX_BH_HI).unwrap(),
        &pub_signals.get(IDX_BH_LO).unwrap(),
    );

    let mut r = Resume::new(m2, consumed);
    let len = suffix.len();
    let mut buf = [0u8; 1024];
    let mut off: u32 = 0;
    while off < len {
        let take = core::cmp::min(1024, len - off);
        suffix
            .slice(off..off + take)
            .copy_into_slice(&mut buf[..take as usize]);
        r.update(&buf[..take as usize]);
        off += take;
    }

    if r.finalize() != bh {
        return Err(Error::SuffixMismatch);
    }
    Ok(())
}

fn groth16_verify(env: &Env, proof: &Proof, pub_signals: &Vec<BytesN<32>>) -> bool {
    let bn = env.crypto().bn254();
    let vk = vk(env);

    let mut vk_x = vk.ic.get(0).unwrap();
    for (s, v) in pub_signals.iter().zip(vk.ic.iter().skip(1)) {
        let fr = fr_from_bytes(env, &s);
        let prod = bn.g1_mul(&v, &fr);
        vk_x = bn.g1_add(&vk_x, &prod);
    }

    let neg_a = -proof.a.clone();
    let vp1 = soroban_sdk::vec![env, neg_a, vk.alpha, vk_x, proof.c.clone()];
    let vp2 = soroban_sdk::vec![env, proof.b.clone(), vk.beta, vk.gamma, vk.delta];

    bn.pairing_check(vp1, vp2)
}

#[contract]
pub struct BodyVerifierBn254;

#[contractimpl]
impl BodyVerifierBn254 {
    /// Pure verification of proof + suffix, no state change. Returns true only
    /// if BOTH the pairing check and the SHA completion against bh= pass.
    pub fn verify_proof(
        env: Env,
        proof: Proof,
        pub_signals: Vec<BytesN<32>>,
        suffix: Bytes,
    ) -> Result<bool, Error> {
        if pub_signals.len() != NUM_SIGNALS || pub_signals.len() + 1 != vk(&env).ic.len() {
            return Err(Error::MalformedVerifyingKey);
        }
        ensure_canonical(&env, &pub_signals)?;
        check_suffix(&env, &pub_signals, &suffix)?;
        Ok(groth16_verify(&env, &proof, &pub_signals))
    }

    /// Verify a body proof AND seal it as a public attestation.
    ///
    /// Check order is cheap-to-expensive (canonical form → replay → SHA over the
    /// suffix → pairing) so invalid submissions cost the sponsor as little as
    /// possible; nothing is persisted until every check has passed.
    ///
    /// NOTE: `suffix` rides in the transaction, so it is public forever in the
    /// ledger history. The client audits it for personal data and shows the user
    /// exactly what will be published before submitting.
    pub fn seal_body(
        env: Env,
        proof: Proof,
        pub_signals: Vec<BytesN<32>>,
        suffix: Bytes,
    ) -> Result<BytesN<32>, Error> {
        if pub_signals.len() == 0 {
            return Err(Error::NoPublicSignals);
        }
        if pub_signals.len() != NUM_SIGNALS || pub_signals.len() + 1 != vk(&env).ic.len() {
            return Err(Error::MalformedVerifyingKey);
        }
        ensure_canonical(&env, &pub_signals)?;

        let nullifier = pub_signals.get(0).unwrap();
        let key = DataKey::Att(nullifier.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadySealed);
        }

        check_suffix(&env, &pub_signals, &suffix)?;

        if !groth16_verify(&env, &proof, &pub_signals) {
            return Err(Error::InvalidProof);
        }

        let statement_hash = hash_statement(&env, &pub_signals);
        let att = Attestation {
            nullifier: nullifier.clone(),
            statement_hash: statement_hash.clone(),
            ledger: env.ledger().sequence(),
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &att);
        env.storage()
            .persistent()
            .extend_ttl(&key, ATT_TTL_THRESHOLD, ATT_TTL);

        Sealed { nullifier: nullifier.clone(), statement_hash }.publish(&env);

        Ok(nullifier)
    }

    /// Read a sealed attestation by id (== nullifier) — same ABI as the header
    /// verifier so the /p page readers work against either contract.
    pub fn get_attestation(env: Env, id: BytesN<32>) -> Option<Attestation> {
        env.storage().persistent().get(&DataKey::Att(id))
    }

    pub fn is_sealed(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Att(nullifier))
    }
}
