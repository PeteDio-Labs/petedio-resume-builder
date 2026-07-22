// Bun compatibility shim for the `mongodb` driver.
//
// The `bson` package (pulled in by `mongodb`) calls
// `node:v8` -> startupSnapshot.isBuildingSnapshot() at import time. Bun hasn't
// implemented that method yet, so it throws ERR_NOT_IMPLEMENTED and *any*
// import of `mongodb` under Bun (bun test, or the production server run with
// `bun build/index.js`) crashes on load. Node isn't affected, so `bun run dev`
// (Vite) doesn't need this either — but the shim is harmless everywhere.
//
// This makes the call return `false` (we are never building a V8 snapshot).
// Remove once Bun ships the upstream fix — see the Resume Builder plan, Risk #3
// (Bun issue #32501). Wired in via `bunfig.toml` `preload`.
function patch(v8mod) {
	const ss = v8mod && v8mod.startupSnapshot;
	if (!ss) return;
	try {
		ss.isBuildingSnapshot = () => false;
	} catch {
		try {
			Object.defineProperty(ss, 'isBuildingSnapshot', {
				value: () => false,
				configurable: true,
				writable: true
			});
		} catch {
			// Give up quietly — nothing else we can do, and throwing here would
			// be worse than the original error.
		}
	}
}

try {
	patch(require('node:v8'));
} catch {
	/* node:v8 unavailable — not on Bun, nothing to patch */
}
try {
	if (typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function') {
		patch(process.getBuiltinModule('v8'));
	}
} catch {
	/* getBuiltinModule not present — ignore */
}
