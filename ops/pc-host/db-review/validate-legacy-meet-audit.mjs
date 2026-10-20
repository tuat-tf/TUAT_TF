import assert from "node:assert/strict";

let input = "";
for await (const part of process.stdin) input += part;
const rows = input.split(/\r?\n/).flatMap(line => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const audits = rows.filter(row => row?.version === 1 && row.missing_source_rows);
assert.equal(audits.length, 3, "Expected all three actual aggregate snapshots");
for (const [phase, audit] of audits.entries()) {
  assert.equal(audit.source.entries, 1);
  assert.equal(audit.source.participants_including_removed, 2);
  assert.equal(audit.source.appearances, 3);
  assert.equal(audit.source.duties, 2);
  assert.equal(audit.legacy_write_guards.enabled, 6);
  assert.equal(audit.pending_legacy_changes, 0);
  assert.equal(audit.meet.ready, phase !== 0);
  assert.equal(audit.meet.source_frozen, phase !== 0);
  assert.equal(audit.missing_source_rows.participants, phase === 0 ? 2 : 0);
  assert.equal(audit.missing_source_rows.helper_profiles, phase === 0 ? 1 : 0);
  assert.equal(audit.missing_source_rows.appearances, [3, 0, 2][phase]);
  for (const key of ["duties", "duty_roles", "party"]) {
    assert.equal(audit.missing_source_rows[key], phase === 0 ? (key === "duties" ? 2 : 1) : 0);
  }
  if (phase > 0) assert.equal(audit.canonical.participants, 3);
}
const followups = rows.filter(row => Number.isInteger(row?.missing_original_keys));
assert.equal(followups.length, 2, "Expected both move and physical-gap follow-ups");
for (const [phase, audit] of followups.entries()) {
  assert.equal(audit.missing_original_keys, phase + 1);
  assert.equal(audit.permanent_ids_present, 1);
  assert.equal(audit.permanent_ids_missing, phase);
  assert.equal(audit.participant_identity_mismatch, 0);
  assert.equal(audit.explained_by_one_preserving_move, 1);
  assert.equal(audit.unexplained, phase);
  assert.equal(audit.current_trials_match_move, 1);
  assert.deepEqual(audit.related_request_actions, { "appearance.moveDivision": 1 });
}
process.stdout.write(JSON.stringify({ aggregateSnapshots: audits.length, followupSnapshots: followups.length, passed: true }));
