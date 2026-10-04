// Synthetic records only, in the dedicated loopback review stack.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const directory=resolve(import.meta.dirname,'../../.contingency/review');
const configPath=resolve(directory,'config.json');
const config=JSON.parse(readFileSync(configPath,'utf8'));
if(config.project!=='tuat-quality-review'||config.origin!=='http://127.0.0.1:18000')throw Error('Invalid review scope');
const marker=resolve(directory,'seed.json');
if(existsSync(marker))throw Error('Review data already seeded; inspect existing state instead of duplicating it');
async function request(port,path,body,method='POST') {
  const response=await fetch(`http://127.0.0.1:${port}${path}`,{method,
    headers:{apikey:config.serviceKey,authorization:`Bearer ${config.serviceKey}`,'content-type':'application/json',prefer:'return=representation','x-tuat-mirror':'1'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(`Review seed failed: ${port}${path.split('?')[0]} (${response.status}): ${error.code??''} ${error.message??error.msg??''}`);}
  return response.json();
}
const insert=(table,rows)=>request(18002,`/${table}`,rows);
const ids={owner:null,members:[],roles:{admin:randomUUID(),member:randomUUID()},note:randomUUID(),article:randomUUID(),thread:randomUUID()};
await insert('roles',[
  {id:ids.roles.admin,name:'検証用管理者',is_everyone:false,is_system:true,can_manage_members:true,can_manage_system:true,can_create_schedule:true,can_create_menu:true,can_create_notice:true,can_decide_practice:true},
  {id:ids.roles.member,name:'検証用部員',is_everyone:true,is_system:false,can_manage_members:false,can_manage_system:false,can_create_schedule:false,can_create_menu:false,can_create_notice:false,can_decide_practice:false},
]);
for(let i=0;i<7;i++) {
  const email=i===0?config.ownerEmail:`review-member-${i}@example.invalid`;
  const data=await request(18001,'/admin/users',{email,password:config.ownerPassword,email_confirm:true});
  const id=data.id??data.user?.id;if(!id)throw Error('Review Auth did not return a synthetic user id');
  if(i===0){ids.owner=id;config.ownerId=id;writeFileSync(configPath,JSON.stringify(config),{mode:0o600});}else ids.members.push(id);
  await request(18002,`/profiles?id=eq.${id}`,{display_name:i===0?'検証 オーナー':`検証 部員${i}`,blocks:[i%2?'short':'middle_long'],grade:i<5?String(i%4+1):'M1',role:i===0?'admin':'member',approved:true,status:'active'},'PATCH');
}
await insert('profile_roles',[{profile_id:ids.owner,role_id:ids.roles.admin}]);
await insert('venues',[{name:'検証用グラウンド',short:'検証G',access:'テスト用の案内です',fee:'無料',url:null}]);
await insert('competition_events',[{name:'男子100m',sort_order:0,measure_type:'time',time_format:'seconds'},{name:'男子1500m',sort_order:1,measure_type:'time',time_format:'minutes'}]);
const today=new Date().toISOString().slice(0,10);
await insert('competitions',[{id:'review-meet',name:'検証用大会・長い大会名でも表示が崩れないことを確認するサンプル',starts_on:today,ends_on:today,is_countdown:true}]);
const schedules=Array.from({length:12},(_,i)=>{const date=new Date();date.setUTCDate(date.getUTCDate()+i);return{id:randomUUID(),schedule_date:date.toISOString().slice(0,10),schedule_type:'practice',title:i===0?'検証用の長い練習予定タイトルを表示するためのサンプル':'検証用練習',meeting_time:'16:30',location:'検証用グラウンド',target_blocks:i%3?['middle_long']:[],created_by:ids.owner};});
await insert('practice_schedules',schedules);
await insert('practice_menus',schedules.slice(0,6).map((s,i)=>({id:randomUUID(),schedule_id:s.id,author_id:ids.owner,group_name:'検証グループ',content:'ジョグ・補強（合成データ）',target_block:'middle_long',status:i===5?'draft':'published'})));
await insert('practice_records',Array.from({length:30},(_,i)=>{const date=new Date();date.setUTCDate(date.getUTCDate()-i);return{id:randomUUID(),user_id:i%4?ids.owner:ids.members[0],recorded_date:date.toISOString().slice(0,10),dist_low:5,dist_actual:5,menu_text:'検証用ジョグ',condition:'normal',memo:'合成データです'};}));
await insert('notices',[{author_id:ids.owner,category:'info',title:'検証用お知らせ',content:'この環境の操作は本番へ反映されません。',pin_home:true,notify_members:false}]);
await insert('notes',[{id:ids.note,author_id:ids.owner,scope:'shared',title:'検証用共有フォルダ・長いタイトルの表示確認',body:'',status:'published',edit_policy:'specified'}]);
await insert('note_editors',[{note_id:ids.note,user_id:ids.members[0]}]);
await insert('note_articles',[{id:ids.article,note_id:ids.note,author_id:ids.owner,title:'検証用記事',body:'これは表示確認用の合成記事です。'}]);
await insert('threads',[{id:ids.thread,author_id:ids.owner,title:'検証用スレッド',folder_id:ids.note}]);
await insert('thread_posts',[{thread_id:ids.thread,author_id:ids.owner,body:'合成データによる画面確認です。'}]);
await insert('tweets',[{user_id:ids.owner,content:'検証版の表示を確認しています。合成データです。'}]);
await insert('pb_records',[{user_id:ids.owner,event_name:'男子1500m',record:'4:30.00',value_cs:27000,meet_name:'検証用大会',recorded_on:today,is_pb:true,is_ub:true,is_official:true,competition_id:'review-meet'}]);
await insert('ob_meet_entries',[{meet_key:'ob-2026',submitted_name:'検証 オーナー',profile_id:ids.owner,grade:'M1',events:['男子1500m'],qualification_marks:{'男子1500m':'4:30.00'},competition_division:'男子'}]);
writeFileSync(marker,JSON.stringify(ids),{mode:0o600});
const devicePath=resolve(directory,'device.json');
if(!existsSync(devicePath))writeFileSync(devicePath,JSON.stringify({deviceHash:null,expiresAt:0,publicOrigin:null}),{mode:0o600});
writeFileSync(resolve(directory,'access.txt'),`検証版専用アクセスコード\n${config.accessCode}\n\n最初に接続したブラウザ1つだけが使えます。別のブラウザへ移すときは検証版からログアウトしてください。\n本番のパスワードやGoogleログインは使いません。\n`,{mode:0o600});
console.log('Synthetic review data seeded. Credentials are stored in the private review directory; none are printed.');
