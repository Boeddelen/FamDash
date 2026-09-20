import { describe, expect, it } from 'vitest';
import { encryptJSON, decryptJSON, secretsMatch } from './crypto';

describe('crypto', () => {
	it('round-trips an object', () => {
		const secret = { username: 'ada@example.com', password: 's3cr3t', calendars: ['a', 'b'] };
		const blob = encryptJSON(secret);
		expect(blob).not.toContain('s3cr3t');
		expect(decryptJSON(blob)).toEqual(secret);
	});

	it('produces a fresh IV each time', () => {
		expect(encryptJSON('x')).not.toBe(encryptJSON('x'));
	});

	it('rejects a tampered ciphertext', () => {
		const blob = encryptJSON('x').split('.');
		blob[2] = Buffer.from('tampered').toString('base64');
		expect(() => decryptJSON(blob.join('.'))).toThrow();
	});
});

describe('secretsMatch', () => {
	it('accepts an exact match and rejects a mismatch, including different lengths', () => {
		expect(secretsMatch('abc123', 'abc123')).toBe(true);
		expect(secretsMatch('abc123', 'abc124')).toBe(false);
		expect(secretsMatch('abc123', 'abc12')).toBe(false);
		expect(secretsMatch('', '')).toBe(true);
	});
});
