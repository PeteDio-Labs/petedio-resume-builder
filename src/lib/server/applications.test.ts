import { describe, expect, it } from 'bun:test';
import { isUsableUrl, normalizeUrl } from './applications';

describe('normalizeUrl', () => {
	it('adds a scheme to a bare host so the link is clickable', () => {
		expect(normalizeUrl('boards.example.com/jobs/1')).toBe('https://boards.example.com/jobs/1');
	});
	it('leaves an explicit scheme alone', () => {
		expect(normalizeUrl('http://example.com')).toBe('http://example.com');
	});
});

describe('isUsableUrl — the tracker stored junk as a dead link (UAT M3)', () => {
	it('accepts real postings', () => {
		for (const u of [
			'https://boards.greenhouse.io/acme/jobs/12345',
			'example.com/careers',
			'http://localhost:5173/jobs/1',
			'https://sub.domain.co.uk/a?b=c#d'
		]) {
			expect(isUsableUrl(u)).toBe(true);
		}
	});

	it('rejects text that only looked like a link', () => {
		// "not a url" became "https://not a url" and rendered as a broken anchor.
		for (const u of ['not a url', '', '   ', 'just some words here', 'acme']) {
			expect(isUsableUrl(u)).toBe(false);
		}
	});

	it('rejects non-http schemes outright rather than relying on the prepend', () => {
		for (const u of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
			expect(isUsableUrl(u)).toBe(false);
		}
	});
});
