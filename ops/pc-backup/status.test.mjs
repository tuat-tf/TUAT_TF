import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backupStatusReady,localSnapshotReady,runtimeStatusReady } from './status.mjs';
const fixtures=JSON.parse(readFileSync(new URL('status-vectors.json',import.meta.url),'utf8'));
for(const fixture of fixtures) test(`backup status contract: ${fixture.name}`,()=>{
  assert.equal(backupStatusReady(fixture.status,fixture.identity,fixture.now),fixture.ready);
});

test('local snapshot capture, restore and offsite evidence belong to this startup and remain ordered',()=>{
  const golden=fixtures.find(f=>f.ready),status=structuredClone(golden.status),identity=golden.identity,imageRoot='/synthetic/images';
  const snapshot={format:'tuat-local-db-images-v1',sourceId:identity.instanceId,generation:identity.generation,databaseSystemIdentifier:identity.databaseSystemIdentifier,
    imageRoot,archiveKey:`ops/pc-backend/${identity.instanceId}/backups/${identity.startedAt.replace(/[:.]/g,'-')}.local.tar.enc`,
    archiveSha256:'a'.repeat(64),archiveBytes:128,capturedAt:identity.startedAt,restoreVerifiedAt:'2026-10-11T00:29:30.000Z',offsiteVerifiedAt:'2026-10-11T00:29:59.000Z',independentRecoveryCopyChecked:true};
  Object.assign(status.backup,{localSnapshot:snapshot,key:snapshot.archiveKey,sha256:snapshot.archiveSha256,bytes:snapshot.archiveBytes});
  assert.equal(backupStatusReady(status,identity,golden.now),true);assert.equal(localSnapshotReady(status,identity,imageRoot,golden.now),true);
  for(const change of [{capturedAt:undefined},{capturedAt:'2026-10-11T00:28:59.999Z'},
    {capturedAt:'2026-10-11T00:29:31.000Z'},{restoreVerifiedAt:'2026-10-11T00:29:59.001Z'},
    {offsiteVerifiedAt:'2026-10-11T00:30:00.001Z'},{capturedAt:'invalid'}]) {
    const changed={...status,backup:{...status.backup,localSnapshot:{...snapshot,...change}}};
    assert.equal(localSnapshotReady(changed,identity,imageRoot,golden.now),false);assert.equal(backupStatusReady(changed,identity,golden.now),false);
    assert.equal(backupStatusReady({...golden.status,backup:{...golden.status.backup,localSnapshot:changed.backup.localSnapshot}},identity,golden.now),false);
  }
  const oldIdentity={...identity,startedAt:'2026-10-10T00:00:00.000Z'};
  assert.equal(localSnapshotReady(status,oldIdentity,imageRoot,golden.now+48*60*60_000),false);
  assert.equal(localSnapshotReady(status,identity,imageRoot,NaN),false);
});

test('local writes survive missing or overdue backups but never an unhealthy/wrong host',()=>{
  const f=fixtures.find(f=>f.ready),status=structuredClone(f.status);
  for(const backup of [null,{...status.backup,verifiedAt:'2020-01-01T00:00:00.000Z'}])
    assert.equal(runtimeStatusReady({...status,backup},f.identity,f.now),true);
  for(const mutate of [s=>{s.target.healthy=false;},s=>{s.heartbeat.maintenance=true;},
    s=>{s.heartbeat.checkedAt=new Date(f.now-120_000).toISOString();},s=>{s.target.databaseSystemIdentifier='9999999999999999999';},
    s=>{s.generation='33333333-3333-4333-8333-333333333333';}]) {
    const changed=structuredClone(status);mutate(changed);assert.equal(runtimeStatusReady(changed,f.identity,f.now),false);
  }
});
