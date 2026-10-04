// Independent local review stack. Schema only; production rows and credentials are never copied.
import { randomBytes, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const directory = resolve(root, '.contingency/review');
mkdirSync(directory, { recursive: true });
const privateWrite = (name, value) => {
  const path = resolve(directory, name);
  writeFileSync(path, value, { mode: 0o600 });
  if (process.platform === 'win32') {
    const account = execFileSync('whoami', { encoding: 'utf8', windowsHide: true }).trim();
    execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${account}:(F)`, 'SYSTEM:(F)'], { stdio: 'ignore', windowsHide: true });
  }
};
const secret = () => randomBytes(32).toString('hex');
const configPath = resolve(directory, 'config.json');
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {
  version: 1, project: 'tuat-quality-review', jwtSecret: secret(), databasePassword: secret(),
  authPassword: secret(), restPassword: secret(), ownerPassword: secret(), accessCode: secret(),
  ownerEmail: 'review-owner@example.invalid', origin: 'http://127.0.0.1:18000',
};
if (config.project !== 'tuat-quality-review' || config.origin !== 'http://127.0.0.1:18000') throw Error('Invalid review scope');
const jwt = role => {
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const value = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ role, iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+86400*30 })}`;
  return `${value}.${createHmac('sha256', config.jwtSecret).update(value).digest('base64url')}`;
};
config.anonKey ??= jwt('anon'); config.serviceKey ??= jwt('service_role');
privateWrite('config.json', JSON.stringify(config));

// Bind only loopback. Auth/rest/db are on a distinct internal network with no Internet route.
const compose = { name: config.project, services: {
  db: { image: 'supabase/postgres:17.6.1.136', container_name: 'tuat-review-db',
    command: ['postgres', '-D', '/var/lib/postgresql/data', '-c', 'listen_addresses=*', '-c', 'shared_preload_libraries='],
    environment: { POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: config.databasePassword, POSTGRES_DB: 'tuat_review', PGDATA: '/var/lib/postgresql/data' },
    volumes: ['review-data:/var/lib/postgresql/data', './init:/docker-entrypoint-initdb.d:ro'], networks: ['review'],
    mem_limit: '512m', cpus: 1, healthcheck: { test: ['CMD-SHELL', 'pg_isready -U postgres -d tuat_review'], interval: '2s', timeout: '3s', retries: 30 } },
  auth: { image: 'supabase/gotrue:v2.196.0', container_name: 'tuat-review-auth', depends_on: { db: { condition: 'service_healthy' } },
    ports: ['127.0.0.1:18001:9999'], networks: ['review'], mem_limit: '128m',
    environment: { GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: 'http://127.0.0.1:18000/_pc/supabase',
      GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${config.authPassword}@db:5432/tuat_review`,
      GOTRUE_SITE_URL: config.origin, GOTRUE_URI_ALLOW_LIST: `${config.origin}/auth/callback`,
      GOTRUE_JWT_SECRET: config.jwtSecret, GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_DISABLE_SIGNUP: 'true', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
      GOTRUE_MAILER_AUTOCONFIRM: 'true', GOTRUE_EXTERNAL_GOOGLE_ENABLED: 'false', GOTRUE_LOG_LEVEL: 'error' } },
  rest: { image: 'postgrest/postgrest:v14.12', container_name: 'tuat-review-rest', depends_on: { db: { condition: 'service_healthy' } },
    ports: ['127.0.0.1:18002:3000'], networks: ['review'], mem_limit: '128m',
    environment: { PGRST_DB_URI: `postgres://authenticator:${config.restPassword}@db:5432/tuat_review`, PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: config.jwtSecret, PGRST_DB_MAX_ROWS: '1000' } },
}, volumes: { 'review-data': {} }, networks: { review: { internal: true } } };
privateWrite('compose.json', JSON.stringify(compose));
mkdirSync(resolve(directory, 'init'), { recursive: true });
// Supabase runtime roles only. Their passwords and JWT signing key are new for this stack.
const roles = ['anon','authenticated','service_role','supabase_admin','supabase_auth_admin','supabase_storage_admin',
  'supabase_realtime_admin','supabase_functions_admin','dashboard_user','supabase_read_only_user',
  'supabase_replication_admin','supabase_etl_admin','supabase_privileged_role'];
const bootstrap = roles.map(role => `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN${['service_role','supabase_admin','supabase_auth_admin','supabase_storage_admin'].includes(role) ? ' BYPASSRLS' : ''}; END IF; END $$;`).join('\n')
  + '\nDO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=\'postgres\') THEN CREATE ROLE postgres SUPERUSER LOGIN; END IF; END $$;\n'
  + `\nDO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator NOINHERIT; END IF; END $$;\nALTER ROLE authenticator LOGIN PASSWORD '${config.restPassword}';\nGRANT anon,authenticated,service_role TO authenticator;\nALTER ROLE supabase_auth_admin LOGIN PASSWORD '${config.authPassword}';\n`
  + 'CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;\n';
privateWrite('init/00-roles.sql', bootstrap);
const wsl = args => execFileSync('wsl', ['-d','Ubuntu','-u','root','--',...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 12*1024*1024 });
// This is a read-only schema export, never a database backup containing people or posts.
const schema = wsl(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner',
  '--schema=public','--schema=auth','--schema=storage','--schema=extensions','--schema=pc_ops']);
privateWrite('init/01-schema.sql', 'BEGIN;\n'+schema.replace(/CREATE SCHEMA (public|auth|storage|extensions);/g,'CREATE SCHEMA IF NOT EXISTS $1;')+'\nCOMMIT;\n');
const authHistory = wsl(['docker','exec','supabase-db','pg_dump','-U','postgres','-d','postgres','--data-only','--no-owner','--no-privileges','--table=auth.schema_migrations']);
privateWrite('init/02-auth-history.sql', authHistory);
privateWrite('init/03-auth-grants.sql', 'ALTER SCHEMA auth OWNER TO supabase_auth_admin; ALTER ROLE supabase_auth_admin SET search_path TO auth, public, extensions; GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin; GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin; GRANT ALL ON ALL FUNCTIONS IN SCHEMA auth TO supabase_auth_admin;\n');
privateWrite('init/04-isolation.sql', 'ALTER TABLE public.notifications DISABLE TRIGGER on_notification_created_send_push;\n');
privateWrite('app.env', [
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:18000`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${config.anonKey}`,
  `SUPABASE_SERVICE_ROLE_KEY=${config.serviceKey}`, 'NEXT_PUBLIC_PC_TRIAL=true', 'IMAGE_STORAGE_READ_ONLY=true',
  'NEXT_PUBLIC_PC_BACKEND=false', 'PC_BACKEND_ENABLED=false', 'PC_TRIAL_VERCEL=false', `PC_TRIAL_BRIDGE_KEY=${config.restPassword}`,
  'R2_READ_ENABLED=false','R2_WRITE_ENABLED=false','R2_UPLOADS_PAUSED=true','SHEET_SYNC_ENABLED=false',
  'NEXT_PUBLIC_UNIVERSITY_DOMAIN=', 'NEXT_PUBLIC_CLOUD_AUTH_URL=', 'NEXT_PUBLIC_CLOUD_AUTH_ANON_KEY=',
].join('\n')+'\n');
console.log('Prepared separate review DB/Auth configuration and schema; no production data or credentials copied.');
console.log('Runtime is unchanged. Start only the tuat-quality-review compose project after inspecting this configuration.');
