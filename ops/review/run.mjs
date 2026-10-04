// Launch Next with only independent review settings, never inherited app credentials.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'../..');
const config=JSON.parse(readFileSync(resolve(root,'.contingency/review/config.json'),'utf8'));
if(config.project!=='tuat-quality-review'||config.origin!=='http://127.0.0.1:18000'||!config.ownerId)throw Error('Review setup is incomplete');
for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local']) {
  if(existsSync(resolve(root,name)))throw Error('Review workspace contains an application env file; isolate it before launching');
}
const action=process.argv[2];
if(!['build','start'].includes(action))throw Error('Use run.mjs build or run.mjs start');
const env={};
for(const name of ['PATH','Path','SystemRoot','WINDIR','windir','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ComSpec','NUMBER_OF_PROCESSORS','OS'])if(process.env[name])env[name]=process.env[name];
for(const line of readFileSync(resolve(root,'.contingency/review/app.env'),'utf8').split(/\r?\n/)) {
  if(!line)continue;
  const at=line.indexOf('=');if(at<1)throw Error('Invalid review setting');
  env[line.slice(0,at)]=line.slice(at+1);
}
if(env.NEXT_PUBLIC_SUPABASE_URL!==config.origin||env.NEXT_PUBLIC_SUPABASE_ANON_KEY!==config.anonKey||env.SUPABASE_SERVICE_ROLE_KEY!==config.serviceKey||env.PC_TRIAL_BRIDGE_KEY!==config.restPassword)throw Error('Review credentials do not match isolated configuration');
env.NODE_ENV='production';env.NEXT_TELEMETRY_DISABLED='1';
const buildMarker=resolve(root,'.contingency/review/build-id.txt');
env.TUAT_REVIEW_BUILD_ID=action==='build'
  ? `review-${execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim()}-${Date.now().toString(36)}`
  : readFileSync(buildMarker,'utf8').trim();
const device=JSON.parse(readFileSync(resolve(root,'.contingency/review/device.json'),'utf8'));
env.TUAT_REVIEW_PUBLIC_ORIGIN=device.publicOrigin??config.origin;
const args=action==='build'?['build','--webpack']:['start','--hostname','127.0.0.1','--port','18003'];
const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),...args],{cwd:root,env,stdio:'inherit',windowsHide:true});
if(action==='start'&&child.pid)writeFileSync(resolve(root,'.contingency/review/app-next.pid'),String(child.pid),{mode:0o600});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{
  if(action==='build'&&code===0)writeFileSync(buildMarker,env.TUAT_REVIEW_BUILD_ID,{mode:0o600});
  process.exit(code??1);
});
