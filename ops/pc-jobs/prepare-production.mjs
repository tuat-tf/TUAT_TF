// Retired before reading any legacy environment or creating private state.
// The current shared-pc runtime reuses the host release/env and the existing Jobs journal.
console.error('Dedicated Jobs preparation is retired. Use the current shared-pc host configuration and ops/pc-jobs/run.mjs --check <private-config.json>; preserve stateDirectory and activateAt. See ops/pc-jobs/README.md.');
process.exitCode = 1;
