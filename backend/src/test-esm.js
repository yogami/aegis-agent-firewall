import './polyfill.js';
import { bls12_381 } from '@noble/curves/bls12-381.js';
console.log(bls12_381.utils.randomSecretKey());
