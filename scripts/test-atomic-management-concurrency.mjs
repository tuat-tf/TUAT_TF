import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const seed = JSON.parse(await readFile(new URL("../.contingency/review/seed.json", import.meta.url), "utf8"));
const owner = seed.owner;
const viewer = seed.members[1];
for (const id of [owner, viewer]) assert.match(id, /^[0-9a-f-]{36}$/i);

// Fixed isolated target. Never accept a production database/container parameter.
function run(sql) {
  const child = spawn("wsl", ["-d", "Ubuntu", "-u", "root", "--", "docker", "exec", "-i", "tuat-review-db", "psql", "-q", "-t", "-A", "-U", "postgres", "-d", "tuat_review", "-v", "ON_ERROR_STOP=1"], { windowsHide: true });
  let output = "";
  let errors = "";
  const markers = [];
  child.stdout.on("data", (chunk) => {
    output += chunk;
    for (const marker of markers) if (output.includes(marker.value)) marker.resolve();
  });
  child.stderr.on("data", (chunk) => { errors += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output, errors }));
  });
  child.stdin.end("\\set VERBOSITY verbose\nSET statement_timeout='8s';\n" + sql);
  return {
    done,
    marker(value) {
      if (output.includes(value)) return Promise.resolve();
      return Promise.race([
        new Promise((resolve) => markers.push({ value, resolve })),
        done.then(() => { throw new Error("Database test ended before its lock marker"); }),
      ]);
    },
  };
}
function authenticate(id) {
  return `SET ROLE authenticated; DO $$ BEGIN PERFORM set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',false); END $$;`;
}
function requireSuccess(result, label) {
  assert.equal(result.code, 0, `${label}: ${result.errors}`);
}
const fixtures = [];
async function fixture() {
  const f = { folder: randomUUID(), article: randomUUID(), a: randomUUID(), b: randomUUID() };
  fixtures.push(f);
  const result = await run(authenticate(owner) + `
    DO $$ BEGIN PERFORM public.save_note_folder('${f.folder}',NULL,'{"title":"Concurrent review","scope":"shared","status":"published","edit_policy":"author"}',ARRAY[]::uuid[]); END $$;
    SELECT public.save_note_article('${f.article}','${f.folder}',NULL,
      '{"title":"Concurrent review","body":"Before","poll_allow_options":true}',ARRAY[]::uuid[],ARRAY[]::uuid[],
      '[{"id":"${f.a}","text":"A"},{"id":"${f.b}","text":"B"}]',true)->>'updated_at';
  `).done;
  requireSuccess(result, "fixture");
  f.version = result.output.trim();
  assert.match(f.version, /^\d{4}-\d{2}-\d{2}T[0-9:.+-]+$/);
  return f;
}
function disablePoll(f) {
  return `SELECT public.save_note_article('${f.article}','${f.folder}','${f.version}',
    '{"title":"Concurrent review","body":"After","poll_allow_options":false}',
    ARRAY['${f.a}','${f.b}']::uuid[],ARRAY[]::uuid[],'[]',false);`;
}
async function pauseSave(f) {
  const saving = run(authenticate(owner) + `BEGIN;
    SELECT pg_advisory_xact_lock(hashtextextended('tuat:note-poll:${f.article}',0));
    \\echo SAVE_LOCKED
    SELECT pg_sleep(0.8);
    ${disablePoll(f)} COMMIT;`);
  await saving.marker("SAVE_LOCKED");
  return saving;
}
try {
  // An option INSERT begins with old RLS visibility, waits, then must observe
  // poll_allow_options=false after the save. It must not resurrect the poll.
  const optionFixture = await fixture();
  const optionSave = await pauseSave(optionFixture);
  const optionInsert = run(authenticate(viewer) + `INSERT INTO public.note_poll_options(article_id,text,created_by) VALUES('${optionFixture.article}','Late option','${viewer}');`);
  const [saved, inserted] = await Promise.all([optionSave.done, optionInsert.done]);
  requireSuccess(saved, "disable poll while option waits");
  assert.notEqual(inserted.code, 0);
  assert.match(inserted.errors, /42501|23503/);

  // A late vote cannot commit after the option has been removed.
  const voteFixture = await fixture();
  const voteSave = await pauseSave(voteFixture);
  const voteInsert = run(authenticate(viewer) + `INSERT INTO public.note_poll_votes(option_id,user_id) VALUES('${voteFixture.b}','${viewer}');`);
  const [voteSaved, voted] = await Promise.all([voteSave.done, voteInsert.done]);
  requireSuccess(voteSaved, "disable poll while vote waits");
  assert.notEqual(voted.code, 0);
  assert.match(voted.errors, /42501|23503/);

  // Unvoting locks a vote row first. It must finish while an article save waits
  // on its cascade, without the reversed advisory/row-lock deadlock.
  const unvoteFixture = await fixture();
  requireSuccess(await run(authenticate(viewer) + `INSERT INTO public.note_poll_votes(option_id,user_id) VALUES('${unvoteFixture.b}','${viewer}');`).done, "seed vote");
  const unvoting = run(authenticate(viewer) + `BEGIN; DELETE FROM public.note_poll_votes WHERE option_id='${unvoteFixture.b}' AND user_id='${viewer}';
    \\echo UNVOTE_LOCKED
    SELECT pg_sleep(0.8); COMMIT;`);
  await unvoting.marker("UNVOTE_LOCKED");
  const disabling = run(authenticate(owner) + disablePoll(unvoteFixture));
  const [unvoted, disabled] = await Promise.all([unvoting.done, disabling.done]);
  requireSuccess(unvoted, "unvote");
  requireSuccess(disabled, "concurrent poll removal");
  console.log("Independent DB concurrency passed: stale option/vote inserts refused; unvote/removal no deadlock.");
} finally {
  for (const f of fixtures) {
    requireSuccess(await run(authenticate(owner) + `DELETE FROM public.notes WHERE id='${f.folder}';`).done, "synthetic fixture cleanup");
  }
}
