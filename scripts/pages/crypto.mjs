import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha2.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

export const randomUUID = () => crypto.randomUUID();
export const randomBytes = (length) => Buffer.from(crypto.getRandomValues(new Uint8Array(length)));

export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw new Error('Unsupported hash');
  const hash = sha256.create();
  return {
    update(value) {
      hash.update(typeof value === 'string' ? new TextEncoder().encode(value) : value);
      return this;
    },
    digest(encoding) {
      return Buffer.from(hash.digest()).toString(encoding);
    }
  };
}

export function scrypt(password, salt, length, options, done) {
  void scryptAsync(new TextEncoder().encode(password), new TextEncoder().encode(salt), {
    N: options.N,
    r: options.r,
    p: options.p,
    maxmem: options.maxmem,
    dkLen: length
  }).then((result) => done(null, Buffer.from(result)), done);
}

export function timingSafeEqual(a, b) {
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
