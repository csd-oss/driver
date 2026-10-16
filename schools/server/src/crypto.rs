use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng as PwRng};
use argon2::Argon2;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::{Rng, RngCore};
use sha2::{Digest, Sha256};

/// URL-safe random secret with `bytes` bytes of entropy.
pub fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

/// Letters and digits a person can read off a screen and type (no 0/O, 1/I/L).
const READABLE: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/// A short join code of `len` readable uppercase letters and digits (8 → ~40 bits; codes expire
/// and their endpoint is rate-limited by the proxy in production).
pub fn readable_code(len: usize) -> String {
    let mut rng = rand::rngs::OsRng;
    (0..len).map(|_| READABLE[rng.gen_range(0..READABLE.len())] as char).collect()
}

/// Normalise what a person typed as a code: uppercase, no spaces or dashes, 0→O-free alphabet
/// confusions mapped back (0→O is not in the alphabet, so 0 becomes O? No: O is not in it either;
/// both are rejected downstream). Keeps it simple: strip separators, uppercase.
pub fn normalize_code(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

/// Session and app tokens are high-entropy, so a plain SHA-256 is the right hash at rest.
pub fn hash_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut PwRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("hash: {e}"))?
        .to_string())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_unique_and_url_safe() {
        let a = random_token(32);
        assert_ne!(a, random_token(32));
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn codes_are_short_and_readable() {
        let c = readable_code(8);
        assert_eq!(c.len(), 8);
        assert!(c.bytes().all(|b| READABLE.contains(&b)));
        assert_eq!(normalize_code(" ab2-3 cd "), "AB23CD");
    }

    #[test]
    fn passwords_round_trip() {
        let h = hash_password("driver").unwrap();
        assert!(verify_password("driver", &h));
        assert!(!verify_password("Driver", &h));
    }
}
