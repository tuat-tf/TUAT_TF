// Read-only acceptance for the actual dedicated runtime and its public bundle.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const directory=resolve(root,'.contingency/review');
const config=JSON.parse(readFileSync(resolve(directory,'config.json'),'utf8'));
if(config.project!=='tuat-quality-review'||config.origin!=='http://127.0.0.1:18000')throw Error('Invalid review scope');
const wsl=args=>execFileSync('wsl',['-d','Ubuntu','-u','root','--',...args],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
const containers=JSON.parse(wsl(['docker','inspect','tuat-review-db','tuat-review-auth','tuat-review-rest']));
for(const container of containers) {
  if(container.Config.Labels['com.docker.compose.project']!==config.project||!container.State.Running)throw Error('Review runtime is not isolated or running');
  if(Object.keys(container.NetworkSettings.Networks).join(',')!=='tuat-quality-review_review')throw Error('Unexpected review network');
}
const network=JSON.parse(wsl(['docker','network','inspect','tuat-quality-review_review']))[0];
if(!network.Internal)throw Error('Review containers have an Internet route');
const volume=containers.find(container=>container.Name==='/tuat-review-db').Mounts.find(mount=>mount.Destination==='/var/lib/postgresql/data');
if(volume?.Name!=='tuat-quality-review_review-data')throw Error('Unexpected review database volume');
const headers={apikey:config.serviceKey,authorization:`Bearer ${config.serviceKey}`};
const response=await fetch('http://127.0.0.1:18002/profiles?select=id,email',{headers});
if(!response.ok)throw Error('Review REST not available');
const profiles=await response.json();
if(profiles.length!==7||profiles.some(profile=>!profile.email.endsWith('@example.invalid'))||!profiles.some(profile=>profile.id===config.ownerId))throw Error('Review profiles are not the expected synthetic records');
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned=`${encoded({alg:'HS256',typ:'JWT'})}.${encoded({role:'authenticated',sub:config.ownerId,exp:Math.floor(Date.now()/1000)+600})}`;
const foreign=`${unsigned}.${createHmac('sha256',randomBytes(32)).update(unsigned).digest('base64url')}`;
const denied=await fetch('http://127.0.0.1:18002/profiles?select=id',{headers:{authorization:`Bearer ${foreign}`}});
if(denied.status!==401)throw Error('Foreign JWT was accepted by review DB');
const privateValues=[config.jwtSecret,config.databasePassword,config.authPassword,config.restPassword,config.ownerPassword,config.serviceKey,config.accessCode];
let assets=0;
function scan(path) {
  for(const entry of readdirSync(path,{withFileTypes:true})) {
    const full=resolve(path,entry.name);if(entry.isDirectory())scan(full);
    else if(/\.(js|json|html)$/.test(entry.name)){assets++;const text=readFileSync(full,'utf8');if(privateValues.some(value=>text.includes(value)))throw Error('A private review credential occurs in a browser asset');}
  }
}
scan(resolve(root,'.next-pc-trial/static'));
const schema=readFileSync(resolve(directory,'init/01-schema.sql'),'utf8');
if(/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(schema)||/^COPY (public|auth)\.(?!schema_migrations)/m.test(schema))throw Error('Schema export contains data or an embedded credential');
const metadata=wsl(['docker','exec','tuat-review-db','psql','-U','postgres','-d','tuat_review','-Atc',"select count(*) || ':' || count(*) filter(where relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'; select tgenabled from pg_trigger where tgrelid='public.notifications'::regclass and tgname='on_notification_created_send_push';"]);
if(metadata.trim()!=='60:60\nD')throw Error('Review RLS or notification isolation differs from expected state');
console.log(JSON.stringify({containers:3,internalNetwork:true,separateVolume:true,syntheticProfiles:profiles.length,foreignJwtRejected:true,publicAssetsScanned:assets,privateCredentialsInBrowserAssets:0,publicTables:60,rlsEnabled:60,externalNotificationDisabled:true}));
