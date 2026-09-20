import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadSecretKey } from './config';

const key = loadSecretKey();

/** Encrypt a JS value to a compact string: base64(iv).base64(tag).base64(ciphertext). */
export function encryptJSON(value: unknown): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [iv, tag, ciphertext].map((b) => b.toString('base64')).join('.');
}

/** Constant-time equality for comparing secret tokens (feed URLs etc.) against user input. */
export function secretsMatch(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	// timingSafeEqual requires equal-length buffers; a length mismatch is safe to
	// short-circuit since it leaks only the fact that the guess is the wrong length,
	// not anything about the shared secret's actual characters.
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

export function decryptJSON<T = unknown>(blob: string): T {
	const [ivB64, tagB64, ctB64] = blob.split('.');
	if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed ciphertext');
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(ctB64, 'base64')),
		decipher.final()
	]);
	return JSON.parse(plaintext.toString('utf8')) as T;
}
