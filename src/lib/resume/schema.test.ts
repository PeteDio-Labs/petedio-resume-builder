import { describe, expect, it } from 'bun:test';
import { emptyProfile, newStory, normalizeProfile } from './schema';

describe('emptyProfile', () => {
	it('produces a well-formed doc with every section present', () => {
		const p = emptyProfile();
		expect(p.x_petedio.schemaVersion).toBe('1');
		expect(p.x_petedio.stories).toEqual([]);
		expect(Array.isArray(p.work)).toBe(true);
		expect(Array.isArray(p.skills)).toBe(true);
	});
});

describe('newStory', () => {
	it('creates a story with a fresh id and empty STAR fields', () => {
		const a = newStory();
		const b = newStory();
		expect(a.id).not.toBe(b.id);
		expect(a.tags).toEqual([]);
		expect(a.usedIn).toEqual([]);
	});
});

describe('normalizeProfile', () => {
	it('drops unknown top-level keys and keeps known fields', () => {
		const out = normalizeProfile({
			basics: { name: 'Jane Doe', email: 'jane@example.com', evil: '<script>' },
			hacker: 'should be gone',
			work: [{ position: 'PM', name: 'Acme', bogus: 1, highlights: ['a', '', 'b'] }]
		});
		expect(out.basics.name).toBe('Jane Doe');
		expect((out as unknown as Record<string, unknown>).hacker).toBeUndefined();
		expect((out.basics as unknown as Record<string, unknown>).evil).toBeUndefined();
		expect(out.work[0].highlights).toEqual(['a', 'b']); // empties filtered
	});

	it('coerces the whole thing to a valid doc even from garbage', () => {
		const out = normalizeProfile(null);
		expect(out.work).toEqual([]);
		expect(out.x_petedio.schemaVersion).toBe('1');
	});

	it('filters invalid story tags and backfills a missing story id', () => {
		const out = normalizeProfile({
			x_petedio: {
				stories: [
					{ title: 'Led a migration', tags: ['leadership', 'not-a-tag'], action: 'did it' }
				]
			}
		});
		const story = out.x_petedio.stories?.[0];
		expect(story?.tags).toEqual(['leadership']);
		expect(story?.id).toBeTruthy();
		expect(story?.action).toBe('did it');
	});

	it('caps absurdly long strings', () => {
		const huge = 'x'.repeat(100_000);
		const out = normalizeProfile({ basics: { summary: huge } });
		expect(out.basics.summary!.length).toBeLessThanOrEqual(20_000);
	});

	it('preserves a valid x_petedio.status', () => {
		const out = normalizeProfile({ x_petedio: { status: 'tailored' } });
		expect(out.x_petedio.status).toBe('tailored');
	});
});
