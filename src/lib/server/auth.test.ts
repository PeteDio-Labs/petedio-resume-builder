import { describe, expect, it } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import { getIdentity } from './auth';

function fakeEvent(headers: Record<string, string> = {}): RequestEvent {
	return {
		request: new Request('https://cv.example.invalid/', { headers })
	} as unknown as RequestEvent;
}

describe('getIdentity', () => {
	it('fails closed (returns null) when Cf-Access-Jwt-Assertion is missing', async () => {
		const identity = await getIdentity(fakeEvent());
		expect(identity).toBeNull();
	});

	it('fails closed on a malformed/unverifiable token rather than throwing', async () => {
		const identity = await getIdentity(fakeEvent({ 'Cf-Access-Jwt-Assertion': 'not-a-real-jwt' }));
		expect(identity).toBeNull();
	});
});
