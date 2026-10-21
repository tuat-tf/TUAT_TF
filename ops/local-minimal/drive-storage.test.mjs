import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {resolve} from 'node:path';
import {PutObjectCommand,HeadObjectCommand,GetObjectCommand,ListObjectsV2Command,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {createDriveSnapshotClient,snapshotStorageScope} from './drive-storage.mjs';

const folder='synthetic-folder-id',owner='club@example.test',key='ops/pc-backend/11111111-1111-4111-8111-111111111111/backups/2026-10-22T01-00-00-000Z.local.tar.enc';
const bytes=Buffer.concat([Buffer.from('TUATPC01'),Buffer.alloc(100,7)]),sha=createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const env={BACKUP_STORAGE:'google-drive',DRIVE_OWNER_EMAIL:owner,DRIVE_FOLDER_ID:folder,DRIVE_CLIENT_FILE:resolve('client.json'),DRIVE_TOKEN_FILE:resolve('token.json')};
 const state={files:[],calls:[],owner,free:100000,scope:'https://www.googleapis.com/auth/drive.file',version:'1',duplicate:false,failUpload:false,corruptChecksum:false,location:'https://www.googleapis.com/upload/test',refreshes:0,uploads:0};
 const reply=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 const read=path=>Buffer.from(JSON.stringify(path===env.DRIVE_CLIENT_FILE?{installed:{client_id:'test.apps.googleusercontent.com',client_secret:'synthetic'}}:{refresh_token:'synthetic'}));
 const fetch=async(url,init)=>{
  state.calls.push({url,method:init?.method??'GET'});assert.equal(init.redirect,'error');
  if(url==='https://oauth2.googleapis.com/token'){state.refreshes++;return reply({access_token:'synthetic-access',expires_in:3600,scope:state.scope});}
  assert.equal(init.headers.Authorization,'Bearer synthetic-access');
  const u=new URL(url);
  if(u.pathname.endsWith('/about'))return reply({user:{emailAddress:state.owner},storageQuota:{limit:'1000000',usage:String(1000000-state.free)}});
  if(u.pathname.endsWith('/files/'+folder))return reply({id:folder,mimeType:'application/vnd.google-apps.folder',trashed:false,owners:[{emailAddress:owner}],permissions:[{type:'user',role:'owner'}]});
  if(u.pathname.endsWith('/generateIds'))return reply({ids:['synthetic-object-id']});
  if(u.pathname==='/drive/v3/files')return reply({files:state.duplicate?[...state.files,...state.files]:state.files,incompleteSearch:false});
  if(u.pathname==='/upload/drive/v3/files'){state.pending=JSON.parse(init.body);return new Response(null,{status:200,headers:{Location:state.location}});}
  if(u.pathname==='/upload/test'){
   state.uploads++;const chunks=[];for await(const chunk of init.body)chunks.push(chunk);
   state.payload=Buffer.concat(chunks);
   const file={...state.pending,size:String(state.payload.length),version:state.version,sha256Checksum:state.corruptChecksum?'f'.repeat(64):sha,trashed:false,owners:[{emailAddress:owner}]};
   state.files.push(file);if(state.failUpload)throw Error('Connection lost after server accepted upload');return reply(file);
  }
  if(u.searchParams.get('alt')==='media')return new Response(state.payload);
  if(init.method==='DELETE'){state.files=[];return new Response(null,{status:204});}
  throw Error('Unexpected test request');
 };
 const client=createDriveSnapshotClient(env,{read,fetch});
 const put=()=>client.send(new PutObjectCommand({Bucket:'club-drive',Key:key,Body:Readable.from([bytes]),ContentLength:bytes.length,IfNoneMatch:'*',Metadata:{sha256:sha}}));
 return {state,env,client,put};
}
test('Drive creates one immutable ciphertext, validates owner, refreshes once and reads exact bytes',async()=>{
 const f=fixture();await f.put();const head=await f.client.send(new HeadObjectCommand({Bucket:'club-drive',Key:key}));
 const got=await f.client.send(new GetObjectCommand({Bucket:'club-drive',Key:key,IfMatch:head.ETag}));
 const chunks=[];for await(const x of got.Body)chunks.push(x);assert.deepEqual(Buffer.concat(chunks),bytes);
 assert.equal(f.state.refreshes,1);assert.equal(f.state.uploads,1);assert.equal(head.Metadata.sha256,sha);
 assert.equal(f.client.storageScopeId,snapshotStorageScope(f.env));
 const list=await f.client.send(new ListObjectsV2Command({Bucket:'club-drive',Prefix:'ops/pc-backend/'}));assert.equal(list.Contents.length,1);assert.equal(list.IsTruncated,false);
 await assert.rejects(f.put());assert.equal(f.state.uploads,1);
});
test('wrong account, expanded OAuth scope, or full account refuse dispatch',async()=>{
 for(const change of [{owner:'wrong@example.test'},{scope:'https://www.googleapis.com/auth/drive'},{free:1}]){
  const f=fixture();Object.assign(f.state,change);await assert.rejects(f.put());assert.equal(f.state.uploads,0);
 }
});
test('uncertain accepted upload is never resent or overwritten',async()=>{
 const f=fixture();f.state.failUpload=true;await assert.rejects(f.put());assert.equal(f.state.uploads,1);
 f.state.failUpload=false;await assert.rejects(f.put());assert.equal(f.state.uploads,1);
});
test('provider checksum mismatch and external upload redirect never become verified',async()=>{
 const corrupt=fixture();corrupt.state.corruptChecksum=true;await assert.rejects(corrupt.put());
 const redirect=fixture();redirect.state.location='https://example.test/upload';await assert.rejects(redirect.put());assert.equal(redirect.state.uploads,0);
});
test('duplicate keys and changed ciphertext block reads and deletion, metadata-only versions do not',async()=>{
 const f=fixture();await f.put();const head=await f.client.send(new HeadObjectCommand({Bucket:'club-drive',Key:key}));
 f.state.duplicate=true;await assert.rejects(f.client.send(new GetObjectCommand({Bucket:'club-drive',Key:key,IfMatch:head.ETag})));
 f.state.duplicate=false;f.state.files[0].version='2';
 assert.equal((await f.client.send(new HeadObjectCommand({Bucket:'club-drive',Key:key}))).ETag,head.ETag);
 f.state.files[0].sha256Checksum='f'.repeat(64);
 await assert.rejects(f.client.send(new DeleteObjectCommand({Bucket:'club-drive',Key:key,IfMatch:head.ETag})));
 assert.equal(f.state.files.length,1);
});
test('scoped deletion requires expected identity and remains possible when account is over quota',async()=>{
 const f=fixture();await f.put();const head=await f.client.send(new HeadObjectCommand({Bucket:'club-drive',Key:key}));
 await assert.rejects(f.client.send(new DeleteObjectCommand({Bucket:'club-drive',Key:key})));
 f.state.free=-1;await f.client.send(new DeleteObjectCommand({Bucket:'club-drive',Key:key,IfMatch:head.ETag}));assert.equal(f.state.files.length,0);
});
