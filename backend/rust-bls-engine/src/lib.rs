use bls12_381::{G1Projective, Scalar};
use group::GroupEncoding;
use sha2::{Sha256, Digest};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SemaProofSigner {
    secret: Scalar,
}

#[wasm_bindgen]
impl SemaProofSigner {
    /// Initialize a new signer with a 32-byte seed (private key shard)
    #[wasm_bindgen(constructor)]
    pub fn new(seed: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(seed);
        let hash = hasher.finalize();
        
        // Convert hash to a Scalar for BLS12-381
        // In a production TSS setup, this would be a specific shard scalar
        let mut bytes = [0u8; 64];
        bytes[..32].copy_from_slice(&hash);
        let secret = Scalar::from_bytes_wide(&bytes);
        
        Self { secret }
    }

    /// Sign an agent intent payload using the BLS12-381 G1 curve
    pub fn sign_intent(&self, payload: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(payload.as_bytes());
        let msg_hash = hasher.finalize();
        
        // Map message hash to a point on the G1 curve (H(m))
        // Domain Separation Tag: semaproof-v1
        let h_m = G1Projective::hash_to_curve(&msg_hash, b"semaproof-v1", b"");
        
        // Signature = H(m) * secret
        let signature = h_m * self.secret;
        
        // Return compressed hex for transmission
        hex::encode(signature.to_bytes())
    }
}

/// Helper for standalone testing
#[wasm_bindgen]
pub fn generate_node_id(seed: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(seed);
    hex::encode(hasher.finalize())
}
