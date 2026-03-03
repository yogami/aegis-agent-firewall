import crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.getRandomValues) {
    globalThis.crypto = crypto.webcrypto;
}
