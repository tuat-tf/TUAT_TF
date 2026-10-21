// Drive transport for the existing encrypted snapshot command contract.
// Only creates immutable files in one private folder. No retry or content update.
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';

const need=(ok)=>{if(!ok)throw Error('Drive snapshot storage validation failed');};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{10,200}$/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const API='https://www.googleapis.com/drive/v3';
const FIELDS='id,name,size,version,sha256Checksum,appProperties,parents,trashed,owners(emailAddress)';
export function driveStorageEnvironment(env) {
  need(env.BACKUP_STORAGE==='google-drive'&&id(env.DRIVE_FOLDER_ID));
  need(typeof env.DRIVE_OWNER_EMAIL==='string'&&/^[^\s@]+@[^\s@]+$/.test(env.DRIVE_OWNER_EMAIL));
  need(isAbsolute(env.DRIVE_CLIENT_FILE??'')&&isAbsolute(env.DRIVE_TOKEN_FILE??''));
  return {provider:'google-drive',owner:env.DRIVE_OWNER_EMAIL,folder:env.DRIVE_FOLDER_ID};
}
export function snapshotStorageScope(env,bucket) {
  if(env.BACKUP_STORAGE==='google-drive')return hash(JSON.stringify(driveStorageEnvironment(env)));
  need(env.BACKUP_STORAGE===undefined&&/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID??'')&&env.R2_BUCKET_NAME===bucket);
  return hash(JSON.stringify({account:env.R2_ACCOUNT_ID,bucket}));
}
async function boundedJson(response) {
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;need(bytes<=2*1024*1024);chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createDriveSnapshotClient(env,{read,fetch:request=globalThis.fetch,now=Date.now}={}) {
  const scope=driveStorageEnvironment(env);need(typeof read==='function');
  const client=JSON.parse(read(env.DRIVE_CLIENT_FILE,16384).toString('utf8')).installed;
  const token=JSON.parse(read(env.DRIVE_TOKEN_FILE,16384).toString('utf8'));
  need(typeof client?.client_id==='string'&&client.client_id.endsWith('.apps.googleusercontent.com')&&client.client_secret&&token.refresh_token);
  let access,expires=0;
  const signalFor=signal=>AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(120000)]);
  async function tokenFor(signal) {
    if(access&&expires>now()+30000)return access;
    const response=await request('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal,
      body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,refresh_token:token.refresh_token,grant_type:'refresh_token'})});
    need(response.ok);const data=await boundedJson(response);
    need(typeof data.access_token==='string'&&Number.isFinite(data.expires_in)&&data.expires_in>0);
    if(data.scope)need(data.scope.split(' ').every(s=>s==='https://www.googleapis.com/auth/drive.file'));
    access=data.access_token;expires=now()+data.expires_in*1000;return access;
  }
  async function call(url,init,signal) {
    need(new URL(url).origin==='https://www.googleapis.com');
    const response=await request(url,{...init,redirect:'error',signal,headers:{Authorization:`Bearer ${await tokenFor(signal)}`,...init?.headers}});
    if(!response.ok){const error=Error(`Drive snapshot request failed (${response.status})`);error.$metadata={httpStatusCode:response.status};throw error;}
    return response;
  }
  const json=async(url,init,signal)=>boundedJson(await call(url,init,signal));
  async function checkScope(signal,bytes=0) {
    const about=await json(API+'/about?fields=user(emailAddress),storageQuota',undefined,signal);
    need(about.user?.emailAddress===scope.owner);
    const limit=Number(about.storageQuota?.limit),usage=Number(about.storageQuota?.usage);
    need(Number.isSafeInteger(limit)&&limit>0&&Number.isSafeInteger(usage)&&usage>=0&&(bytes===0||limit-usage>=bytes));
    const folder=await json(API+'/files/'+scope.folder+'?fields=id,mimeType,trashed,owners(emailAddress),permissions(type,role)',undefined,signal);
    need(folder.id===scope.folder&&folder.mimeType==='application/vnd.google-apps.folder'&&folder.trashed===false
      &&folder.owners?.length===1&&folder.owners[0].emailAddress===scope.owner&&Array.isArray(folder.permissions)
      &&folder.permissions.length===1&&folder.permissions[0].type==='user'&&folder.permissions[0].role==='owner');
  }
  function metadata(file) {
    need(id(file.id)&&file.trashed===false&&file.parents?.length===1&&file.parents[0]===scope.folder
      &&file.owners?.length===1&&file.owners[0].emailAddress===scope.owner);
    const bytes=Number(file.size);need(Number.isSafeInteger(bytes)&&bytes>=0&&/^[0-9]+$/.test(file.version??''));
    const key=file.appProperties?.snapshotKey??`unmanaged/${file.id}`;
    need(typeof key==='string'&&Buffer.byteLength(key)<=113&&!/[\r\n\0]/.test(key));
    const sha=file.appProperties?.sha256;
    if(file.appProperties?.snapshotKey)need(/^[a-f0-9]{64}$/.test(sha??'')&&file.sha256Checksum===sha);
    // Drive may advance version while asynchronously processing unchanged bytes.
    // Snapshot identity is its immutable file ID and provider-computed content hash.
    return {file,Key:key,Size:bytes,ETag:`"${file.id}:${file.sha256Checksum??'unmanaged'}"`,Metadata:{sha256:sha},ContentLength:bytes};
  }
  async function list(input,signal) {
    const params=new URLSearchParams({q:`'${scope.folder}' in parents and trashed = false`,spaces:'drive',pageSize:'1000',fields:`nextPageToken,incompleteSearch,files(${FIELDS})`});
    if(input.ContinuationToken)params.set('pageToken',input.ContinuationToken);
    const data=await json(API+'/files?'+params,undefined,signal);
    need(Array.isArray(data.files)&&data.incompleteSearch!==true);
    const files=data.files.map(metadata).filter(f=>!input.Prefix||f.Key.startsWith(input.Prefix));
    return {Contents:files.map(({Key,Size,ETag})=>({Key,Size,ETag})),IsTruncated:!!data.nextPageToken,
      ...(data.nextPageToken?{NextContinuationToken:data.nextPageToken}:{})};
  }
  async function lookup(key,signal,{allowAbsent=false}={}) {
    need(typeof key==='string'&&Buffer.byteLength(key)<=113&&!/[\\'\r\n\0]/.test(key));
    const params=new URLSearchParams({q:`'${scope.folder}' in parents and trashed = false and appProperties has { key='snapshotKey' and value='${key}' }`,spaces:'drive',pageSize:'2',fields:`nextPageToken,incompleteSearch,files(${FIELDS})`});
    const data=await json(API+'/files?'+params,undefined,signal);need(Array.isArray(data.files)&&!data.nextPageToken&&data.incompleteSearch!==true&&data.files.length<=1);
    if(!data.files.length){if(allowAbsent)return null;const error=Error('Drive snapshot not found');error.name='NotFound';throw error;}
    const found=metadata(data.files[0]);need(found.Key===key);return found;
  }
  const match=(found,input)=>{need(!input.IfMatch||found.ETag===input.IfMatch);return found;};
  return {
    storageProvider:'google-drive',storageScopeId:snapshotStorageScope(env),
    config:{maxAttempts:async()=>1},destroy(){access=undefined;},
    async send(command,{abortSignal}={}) {
      const signal=signalFor(abortSignal),input=command.input;need(input&&typeof input.Bucket==='string');
      await checkScope(signal,command.constructor.name==='PutObjectCommand'?input.ContentLength:0);
      switch(command.constructor.name) {
        case 'ListObjectsV2Command':return list(input,signal);
        case 'PutObjectCommand': {
          need(input.IfNoneMatch==='*'&&Number.isSafeInteger(input.ContentLength)&&input.ContentLength>=36&&input.ContentLength<=16*1024**3
            &&/^[a-f0-9]{64}$/.test(input.Metadata?.sha256??''));
          need(await lookup(input.Key,signal,{allowAbsent:true})===null);
          const generated=await json(API+'/files/generateIds?count=1&space=drive&type=files',undefined,signal);need(generated.ids?.length===1&&id(generated.ids[0]));
          const start=await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields='+encodeURIComponent(FIELDS),{method:'POST',
            headers:{'Content-Type':'application/json','X-Upload-Content-Type':'application/octet-stream','X-Upload-Content-Length':String(input.ContentLength)},
            body:JSON.stringify({id:generated.ids[0],name:input.Key.split('/').at(-1),parents:[scope.folder],appProperties:{snapshotKey:input.Key,sha256:input.Metadata.sha256}})},signal);
          const location=start.headers.get('location');need(location&&new URL(location).origin==='https://www.googleapis.com');
          const uploaded=await json(location,{method:'PUT',duplex:'half',headers:{'Content-Type':'application/octet-stream','Content-Length':String(input.ContentLength)},body:input.Body},signal);
          const proof=metadata(uploaded);need(proof.Key===input.Key&&proof.Size===input.ContentLength&&proof.Metadata.sha256===input.Metadata.sha256);
          return {ETag:proof.ETag};
        }
        case 'HeadObjectCommand':return match(await lookup(input.Key,signal),input);
        case 'GetObjectCommand': {
          const found=match(await lookup(input.Key,signal),input);
          const response=await call(API+'/files/'+found.file.id+'?alt=media',undefined,signal);
          return {...found,Body:response.body};
        }
        case 'DeleteObjectCommand': {
          // Caller must additionally hold the existing immutable-namespace writer
          // proof, validate retained recovery and persist its unknown-delete intent.
          need(typeof input.IfMatch==='string'&&input.IfMatch);
          const found=match(await lookup(input.Key,signal),input);
          await call(API+'/files/'+found.file.id,{method:'DELETE'},signal);return {};
        }
        default:throw Error('Unsupported Drive snapshot operation');
      }
    },
  };
}
