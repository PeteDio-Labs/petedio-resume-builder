import { describe, expect, it } from 'bun:test';
import { __resetMemoryDb, createInMemoryDb, seedDemoProfiles } from './memory';
import { createRepository } from './repository';
import { normalizeProfile } from '../../resume/schema';

describe('createInMemoryDb', () => {
	it('supports findOne / insertOne / replaceOne(upsert) / deleteOne / find', async () => {
		const db = createInMemoryDb();
		const col = db.collection('t');

		await col.insertOne({ userEmail: 'a', v: 1 });
		expect((await col.findOne({ userEmail: 'a' }))?.v).toBe(1);
		expect(await col.findOne({ userEmail: 'b' })).toBeNull();

		// replace existing
		await col.replaceOne({ userEmail: 'a' }, { userEmail: 'a', v: 2 });
		expect((await col.findOne({ userEmail: 'a' }))?.v).toBe(2);

		// upsert a new one
		await col.replaceOne({ userEmail: 'c' }, { userEmail: 'c', v: 9 }, { upsert: true });
		expect((await col.findOne({ userEmail: 'c' }))?.v).toBe(9);

		await col.deleteOne({ userEmail: 'a' });
		expect(await col.findOne({ userEmail: 'a' })).toBeNull();

		const rest = await col.find({}).toArray();
		expect(rest).toHaveLength(1); // only 'c' remains
	});

	it('replaceOne preserves the matched _id and generates one on upsert-insert', async () => {
		const db = createInMemoryDb();
		const col = db.collection('t');

		await col.insertOne({ userEmail: 'a', v: 1 });
		const before = await col.findOne({ userEmail: 'a' });
		expect(before?._id).toBeTruthy();

		// replace keeps the same _id (Mongo immutability)
		await col.replaceOne({ userEmail: 'a' }, { userEmail: 'a', v: 2 });
		const after = await col.findOne({ userEmail: 'a' });
		expect(after?._id).toBe(before!._id);
		expect(after?.v).toBe(2);

		// upsert-insert assigns a fresh _id
		await col.replaceOne({ userEmail: 'z' }, { userEmail: 'z', v: 9 }, { upsert: true });
		expect((await col.findOne({ userEmail: 'z' }))?._id).toBeTruthy();
	});
});

describe('seedDemoProfiles + repository', () => {
	it('seeds a synthetic profile per email, idempotently and row-scoped', async () => {
		const db = createInMemoryDb();
		await seedDemoProfiles(db, ['jane@demo.test', 'JANE@demo.test']); // dup (case) ignored

		const jane = createRepository('jane@demo.test', () => Promise.resolve(db));
		const bob = createRepository('bob@demo.test', () => Promise.resolve(db));

		const janeProfile = await jane.profiles.get();
		expect(janeProfile?.basics.name).toBe('Jane Doe');
		expect(janeProfile?.userEmail).toBe('jane@demo.test');
		expect(janeProfile?.work.length).toBeGreaterThan(0);

		// Bob wasn't seeded — row scoping means he sees nothing.
		expect(await bob.profiles.get()).toBeNull();

		// Re-seeding doesn't duplicate.
		await seedDemoProfiles(db, ['jane@demo.test']);
		const all = await db.collection('profiles').find({ userEmail: 'jane@demo.test' }).toArray();
		expect(all).toHaveLength(1);
	});
});

describe('demo mode via resolveDb (default repository provider)', () => {
	it('reads seeded demo data when DEMO_MODE=true, with no injected provider', async () => {
		const savedDemo = process.env.DEMO_MODE;
		const savedAllowed = process.env.ALLOWED_USERS;
		process.env.DEMO_MODE = 'true';
		process.env.ALLOWED_USERS = 'demo-int@test.local';
		__resetMemoryDb();
		try {
			// No provider arg → uses resolveDb → isDemoMode() → in-memory + seed.
			const repo = createRepository('demo-int@test.local');
			const profile = await repo.profiles.get();
			expect(profile?.basics.name).toBe('Jane Doe');

			// Saving persists in-memory (mirrors the real save path, which
			// normalizes to a clean JSON Resume doc before upserting).
			const edited = normalizeProfile(profile);
			edited.basics.name = 'Edited In Demo';
			await repo.profiles.upsert(edited);
			expect((await repo.profiles.get())?.basics.name).toBe('Edited In Demo');
		} finally {
			__resetMemoryDb();
			if (savedDemo === undefined) delete process.env.DEMO_MODE;
			else process.env.DEMO_MODE = savedDemo;
			if (savedAllowed === undefined) delete process.env.ALLOWED_USERS;
			else process.env.ALLOWED_USERS = savedAllowed;
		}
	});
});
