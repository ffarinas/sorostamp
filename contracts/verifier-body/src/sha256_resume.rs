//! SHA-256 "resume": continue hashing from a midstate produced elsewhere.
//!
//! The body circuit proves M1 --window--> M2 in zero knowledge; this module lets
//! the contract absorb the PUBLIC suffix (everything after the window) starting
//! from M2 and apply the standard padding for the FULL message length, yielding
//! the digest that must equal the DKIM `bh=`. Soroban's sha256 host function only
//! hashes from scratch, so the compression function is implemented here.
//!
//! All arithmetic is `wrapping_*` — SHA-256 is defined mod 2^32 and this crate
//! builds with overflow-checks on.

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

fn compress(state: &mut [u32; 8], block: &[u8]) {
    debug_assert_eq!(block.len(), 64);
    let mut w = [0u32; 64];
    for i in 0..16 {
        w[i] = u32::from_be_bytes([block[4 * i], block[4 * i + 1], block[4 * i + 2], block[4 * i + 3]]);
    }
    for i in 16..64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
    }

    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
    for i in 0..64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ (!e & g);
        let t1 = h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let t2 = s0.wrapping_add(maj);
        h = g; g = f; f = e; e = d.wrapping_add(t1);
        d = c; c = b; b = a; a = t1.wrapping_add(t2);
    }
    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
    state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g);
    state[7] = state[7].wrapping_add(h);
}

/// Continue SHA-256 from `midstate` (the state after `consumed` bytes, which MUST
/// be a multiple of 64), absorb `suffix`, apply standard padding for the total
/// message length `consumed + suffix.len()`, and return the final digest.
///
/// `suffix` is streamed through the closure-free iterator interface below so the
/// contract can feed soroban `Bytes` in bounded stack chunks.
pub struct Resume {
    state: [u32; 8],
    /// bytes fully absorbed so far (always a multiple of 64)
    absorbed: u64,
    /// partial block awaiting more bytes
    buf: [u8; 64],
    buf_len: usize,
}

impl Resume {
    pub fn new(midstate: [u8; 32], consumed: u64) -> Self {
        debug_assert!(consumed % 64 == 0);
        let mut state = [0u32; 8];
        for i in 0..8 {
            state[i] = u32::from_be_bytes([
                midstate[4 * i],
                midstate[4 * i + 1],
                midstate[4 * i + 2],
                midstate[4 * i + 3],
            ]);
        }
        Resume { state, absorbed: consumed, buf: [0u8; 64], buf_len: 0 }
    }

    pub fn update(&mut self, mut data: &[u8]) {
        if self.buf_len > 0 {
            let need = 64 - self.buf_len;
            let take = need.min(data.len());
            self.buf[self.buf_len..self.buf_len + take].copy_from_slice(&data[..take]);
            self.buf_len += take;
            data = &data[take..];
            if self.buf_len == 64 {
                let block = self.buf;
                compress(&mut self.state, &block);
                self.absorbed += 64;
                self.buf_len = 0;
            }
        }
        while data.len() >= 64 {
            compress(&mut self.state, &data[..64]);
            self.absorbed += 64;
            data = &data[64..];
        }
        if !data.is_empty() {
            self.buf[..data.len()].copy_from_slice(data);
            self.buf_len = data.len();
        }
    }

    /// Current midstate as bytes — only meaningful on a block boundary.
    #[cfg(test)]
    pub fn midstate(&self) -> [u8; 32] {
        debug_assert_eq!(self.buf_len, 0);
        let mut out = [0u8; 32];
        for i in 0..8 {
            out[4 * i..4 * i + 4].copy_from_slice(&self.state[i].to_be_bytes());
        }
        out
    }

    pub fn finalize(mut self) -> [u8; 32] {
        let total_bits = (self.absorbed + self.buf_len as u64) * 8;
        // 0x80 terminator, zero-pad to 56 mod 64, then the 64-bit BE bit length
        let mut tail = [0u8; 128];
        tail[..self.buf_len].copy_from_slice(&self.buf[..self.buf_len]);
        tail[self.buf_len] = 0x80;
        let tail_len = if self.buf_len < 56 { 64 } else { 128 };
        tail[tail_len - 8..tail_len].copy_from_slice(&total_bits.to_be_bytes());
        for chunk in tail[..tail_len].chunks_exact(64) {
            compress(&mut self.state, chunk);
        }

        let mut out = [0u8; 32];
        for i in 0..8 {
            out[4 * i..4 * i + 4].copy_from_slice(&self.state[i].to_be_bytes());
        }
        out
    }
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use sha2::{Digest, Sha256};
    use std::vec::Vec;

    const IV: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    /// Reference midstate: compress `n_blocks` 64-byte blocks of `msg` from the IV.
    fn midstate_after(msg: &[u8], n_blocks: usize) -> [u8; 32] {
        let mut state = IV;
        for b in 0..n_blocks {
            compress(&mut state, &msg[b * 64..(b + 1) * 64]);
        }
        let mut out = [0u8; 32];
        for i in 0..8 {
            out[4 * i..4 * i + 4].copy_from_slice(&state[i].to_be_bytes());
        }
        out
    }

    fn assert_resume_matches(msg: &[u8], split_blocks: usize) {
        let consumed = split_blocks * 64;
        assert!(msg.len() >= consumed);
        let mid = midstate_after(msg, split_blocks);
        let mut r = Resume::new(mid, consumed as u64);
        // feed the suffix in awkward chunk sizes to exercise buffering
        for chunk in msg[consumed..].chunks(37) {
            r.update(chunk);
        }
        let got = r.finalize();
        let want: [u8; 32] = Sha256::digest(msg).into();
        assert_eq!(got, want, "len={} split={}", msg.len(), split_blocks);
    }

    #[test]
    fn resume_matches_reference_across_edges() {
        // lengths straddling every padding edge case, incl. empty suffix
        let msg: Vec<u8> = (0..40_000u32).map(|i| (i * 31 % 251) as u8).collect();
        for &len in &[64usize, 65, 119, 120, 128, 191, 192, 1000, 25_533, 39_999] {
            let m = &msg[..len];
            let max_split = len / 64;
            for &split in &[1usize, 2, max_split] {
                if split >= 1 && split <= max_split {
                    assert_resume_matches(m, split);
                }
            }
        }
    }

    #[test]
    fn resume_with_empty_suffix() {
        let msg: Vec<u8> = (0..128u32).map(|i| i as u8).collect();
        assert_resume_matches(&msg, 2); // suffix is empty — padding-only finalize
    }

    #[test]
    fn full_message_from_iv_matches_sha256() {
        // Resume from the IV with consumed=0 must equal plain SHA-256.
        let mut iv_bytes = [0u8; 32];
        for i in 0..8 {
            iv_bytes[4 * i..4 * i + 4].copy_from_slice(&IV[i].to_be_bytes());
        }
        let msg = b"abc";
        let mut r = Resume::new(iv_bytes, 0);
        r.update(msg);
        let want: [u8; 32] = Sha256::digest(msg).into();
        assert_eq!(r.finalize(), want);
    }
}
