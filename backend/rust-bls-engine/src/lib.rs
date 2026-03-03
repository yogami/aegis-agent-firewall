use blst::min_sig::{SecretKey, Signature};
use sha2::{Sha256, Digest};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SemaProofSigner {
    sk: SecretKey,
}

#[wasm_bindgen]
impl SemaProofSigner {
    /// Initialize a new signer with a 32-byte seed (private key shard)
    #[wasm_bindgen(constructor)]
    pub fn new(seed: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(seed);
        let hash = hasher.finalize();

        let sk = SecretKey::key_gen(&hash, &[]).expect("Invalid seed for SecretKey");
        Self { sk }
    }

    /// Sign an agent intent payload using the BLS12-381 G1 curve (MinSig)
    pub fn sign_intent(&self, payload: &str) -> String {
        let msg_bytes = payload.as_bytes();

        // Domain Separation Tag following IETF BLS standard
        let dst = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

        // Sign the message
        let signature = self.sk.sign(msg_bytes, dst, &[]);

        // Return compressed hex for transmission
        hex::encode(signature.compress())
    }
}

/// Helper for standalone testing
#[wasm_bindgen]
pub fn generate_node_id(seed: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(seed);
    hex::encode(hasher.finalize())
}
