/**
 * Data-layer factory: pick the real MongoDB or the in-memory demo store from
 * the environment. This is the single selection point — the exact analog of
 * palworld-panel's `createApplier()` choosing `demoApplier` vs `gitOpsApplier`
 * from `PANEL_APPLIER`. The repository uses `resolveDb` as its default provider,
 * so every route gets demo behavior automatically when `DEMO_MODE=true`, and
 * nothing else in the app has to know which backing store it's talking to.
 */
import type { Db } from 'mongodb';
import { isDemoMode } from '../config';
import { getDb } from './client';
import { getMemoryDb } from './memory';

/** Connected Db for the current mode: in-memory in demo mode, else real Mongo. */
export function resolveDb(): Promise<Db> {
	return isDemoMode() ? getMemoryDb() : getDb();
}
