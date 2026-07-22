/**
 * Deterministic text embeddings for the demo/offline provider — a hashed
 * bag-of-words vector, L2-normalized, so cosine similarity is reproducible with
 * no model. Community MongoDB has no vector search anyway (plan §5), so we do
 * cosine in app code. The real Ollama embed lane can replace `embedText` behind
 * the same shape later.
 */
import { STOPWORDS } from './keywords';

const DIM = 128;

// Interview questions and STAR stories share a lot of filler ("you", "the",
// "was", "time"). Without stopword removal an unrelated question ("Are you
// authorized to work in the US?") scored HIGHER against a story than a
// genuinely relevant one — the similarity was measuring English, not meaning.
// Filtering them is what makes a relevance threshold meaningful at all.
const EXTRA_STOP = new Set([
	'tell', 'me', 'about', 'time', 'describe', 'give', 'example', 'you', 'your', 'yourself',
	'us', 'we', 'my', 'i', 'they', 'he', 'she', 'it', 'that', 'this', 'there', 'here',
	'did', 'does', 'done', 'get', 'got', 'go', 'went', 'make', 'made', 'take', 'took',
	'so', 'if', 'no', 'yes', 'one', 'two', 'now', 'day', 'days'
]);

function hash(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

export function embedText(text: string): number[] {
	const v = new Array<number>(DIM).fill(0);
	const tokens = (text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter(
		(t) => !STOPWORDS.has(t) && !EXTRA_STOP.has(t)
	);
	for (const t of tokens) v[hash(t) % DIM] += 1;
	const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
	return v.map((x) => x / norm);
}

/** Cosine similarity of two L2-normalized vectors (i.e. their dot product). */
export function cosine(a: number[], b: number[]): number {
	let d = 0;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) d += a[i] * b[i];
	return d;
}
