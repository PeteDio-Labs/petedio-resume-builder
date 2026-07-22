import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { allowedUsers, demoUser, isAllowedEmail, isDemoMode } from './config';

// These functions read process.env live, so snapshot + clear the relevant keys
// around every test to keep them isolated from the ambient environment.
const KEYS = ['DEMO_MODE', 'DEMO_USER', 'ALLOWED_USERS'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
	saved = {};
	for (const k of KEYS) {
		saved[k] = process.env[k];
		delete process.env[k];
	}
});
afterEach(() => {
	for (const k of KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe('isDemoMode', () => {
	it('is false by default', () => {
		expect(isDemoMode()).toBe(false);
	});
	it('is true only for exactly "true"', () => {
		process.env.DEMO_MODE = 'true';
		expect(isDemoMode()).toBe(true);
		process.env.DEMO_MODE = '1';
		expect(isDemoMode()).toBe(false);
	});
});

describe('allowedUsers', () => {
	it('parses, trims, lowercases, and drops blanks', () => {
		process.env.ALLOWED_USERS = ' A@X.com , ,b@y.com ';
		expect(allowedUsers()).toEqual(['a@x.com', 'b@y.com']);
	});
	it('is empty when unset', () => {
		expect(allowedUsers()).toEqual([]);
	});
});

describe('demoUser', () => {
	it('defaults to the first allow-listed user', () => {
		process.env.ALLOWED_USERS = 'a@x.com,b@y.com';
		expect(demoUser()).toBe('a@x.com');
	});
	it('falls back to a placeholder with no allow-list', () => {
		expect(demoUser()).toBe('demo@resume.local');
	});
	it('honors the DEMO_USER override (lowercased)', () => {
		process.env.DEMO_USER = 'Demo@X.com';
		expect(demoUser()).toBe('demo@x.com');
	});
});

describe('isAllowedEmail', () => {
	it('denies by default', () => {
		expect(isAllowedEmail('x@y.com')).toBe(false);
	});
	it('allows allow-listed emails case-insensitively', () => {
		process.env.ALLOWED_USERS = 'a@x.com';
		expect(isAllowedEmail('A@X.com')).toBe(true);
	});
	it('allows the demo user ONLY in demo mode', () => {
		process.env.DEMO_USER = 'demo@x.com';
		expect(isAllowedEmail('demo@x.com')).toBe(false); // not in demo mode

		process.env.DEMO_MODE = 'true';
		expect(isAllowedEmail('demo@x.com')).toBe(true);
		// demo mode still doesn't open the door to arbitrary emails
		expect(isAllowedEmail('random@x.com')).toBe(false);
	});
});
