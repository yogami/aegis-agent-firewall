use blst::min_sig::{SecretKey, PublicKey, Signature, AggregateSignature, AggregatePublicKey};
use blst::BLST_ERROR;
use sha2::{Sha256, Digest};
use wasm_bindgen::prelude::*;

/// Domain Separation Tag — IETF BLS standard
const DST: &[u8] = b"BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_";

// ═══════════════════════════════════════════════════════════
//  Key Generation
// ═══════════════════════════════════════════════════════════

/// Generate a BLS12-381 keypair from a 32-byte random seed.
/// Returns JSON: {"sk": "hex...", "pk": "hex..."}
#[wasm_bindgen]
pub fn generate_keypair(seed: &[u8]) -> String {
    let mut ikm = [0u8; 32];
    let len = std::cmp::min(seed.len(), 32);
    ikm[..len].copy_from_slice(&seed[..len]);

    let sk = SecretKey::key_gen(&ikm, &[]).expect("key_gen failed");
    let pk = sk.sk_to_pk();

    serde_json::json!({
        "sk": hex::encode(sk.to_bytes()),
        "pk": hex::encode(pk.compress())
    }).to_string()
}

/// Derive public key from a secret key hex string.
/// Returns compressed public key as hex.
#[wasm_bindgen]
pub fn get_public_key(sk_hex: &str) -> String {
    let sk_bytes = hex::decode(sk_hex).expect("Invalid sk hex");
    let sk = SecretKey::from_bytes(&sk_bytes).expect("Invalid secret key bytes");
    let pk = sk.sk_to_pk();
    hex::encode(pk.compress())
}

// ═══════════════════════════════════════════════════════════
//  Signing
// ═══════════════════════════════════════════════════════════

/// Sign a message with a secret key. Both inputs are hex strings.
/// Returns compressed signature as hex (96 bytes = 192 hex chars for G2,
/// or 48 bytes = 96 hex chars for G1 in min_sig).
#[wasm_bindgen]
pub fn sign_message(sk_hex: &str, message_hex: &str) -> String {
    let sk_bytes = hex::decode(sk_hex).expect("Invalid sk hex");
    let msg_bytes = hex::decode(message_hex).expect("Invalid message hex");

    let sk = SecretKey::from_bytes(&sk_bytes).expect("Invalid secret key");
    let sig = sk.sign(&msg_bytes, DST, &[]);

    hex::encode(sig.compress())
}

// ═══════════════════════════════════════════════════════════
//  Aggregation (JSON array of hex strings)
// ═══════════════════════════════════════════════════════════

/// Aggregate multiple BLS signatures into one.
/// Input: JSON array of hex-encoded compressed signatures, e.g. '["ab01...", "cd02..."]'
/// Returns: aggregated compressed signature as hex.
#[wasm_bindgen]
pub fn aggregate_signatures(sigs_json: &str) -> String {
    let sig_hexes: Vec<String> = serde_json::from_str(sigs_json).expect("Invalid JSON array");

    let sigs: Vec<Signature> = sig_hexes.iter().map(|h| {
        let bytes = hex::decode(h).expect("Invalid sig hex");
        Signature::from_bytes(&bytes).expect("Invalid signature bytes")
    }).collect();

    let sig_refs: Vec<&Signature> = sigs.iter().collect();
    let agg = AggregateSignature::aggregate(&sig_refs, true)
        .expect("Signature aggregation failed");

    hex::encode(agg.to_signature().compress())
}

/// Aggregate multiple BLS public keys into one.
/// Input: JSON array of hex-encoded compressed public keys.
/// Returns: aggregated compressed public key as hex.
#[wasm_bindgen]
pub fn aggregate_public_keys(pks_json: &str) -> String {
    let pk_hexes: Vec<String> = serde_json::from_str(pks_json).expect("Invalid JSON array");

    let pks: Vec<PublicKey> = pk_hexes.iter().map(|h| {
        let bytes = hex::decode(h).expect("Invalid pk hex");
        PublicKey::from_bytes(&bytes).expect("Invalid public key bytes")
    }).collect();

    let pk_refs: Vec<&PublicKey> = pks.iter().collect();
    let agg = AggregatePublicKey::aggregate(&pk_refs, true)
        .expect("Public key aggregation failed");

    hex::encode(agg.to_public_key().compress())
}

// ═══════════════════════════════════════════════════════════
//  Verification
// ═══════════════════════════════════════════════════════════

/// Verify an aggregated signature against an aggregated public key and message.
/// All inputs are hex strings. Returns true if valid.
#[wasm_bindgen]
pub fn verify(sig_hex: &str, message_hex: &str, pk_hex: &str) -> bool {
    let sig_bytes = match hex::decode(sig_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let msg_bytes = match hex::decode(message_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let pk_bytes = match hex::decode(pk_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let sig = match Signature::from_bytes(&sig_bytes) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let pk = match PublicKey::from_bytes(&pk_bytes) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let result = sig.verify(true, &msg_bytes, DST, &[], &pk, true);
    result == BLST_ERROR::BLST_SUCCESS
}

/// Generate a node ID from a seed (SHA-256 hash).
#[wasm_bindgen]
pub fn generate_node_id(seed: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(seed);
    hex::encode(hasher.finalize())
}
