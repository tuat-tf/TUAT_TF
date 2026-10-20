import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalPublicOrigin } from './worker.mjs';

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Worker configuration object required');
  const allowed = new Set(['$schema', 'name', 'main', 'compatibility_date', 'workers_dev', 'vars', 'vpc_services', 'assets']);
  if (Object.keys(config).some(key => !allowed.has(key))) throw Error('Only the fixed entry configuration is supported');
  if (typeof config.name !== 'string' || config.name.includes('REPLACE') || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(config.name)) {
    throw Error('Replace the Worker name placeholder with its fixed DNS label');
  }
  if (config.main !== './worker.mjs' || config.workers_dev !== true) throw Error('Local worker.mjs and workers_dev=true required');
  if (typeof config.compatibility_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(config.compatibility_date)) {
    throw Error('Explicit compatibility_date required');
  }
  if (!config.vars || Object.keys(config.vars).length !== 1 || !Object.hasOwn(config.vars, 'APP_PUBLIC_ORIGIN')) {
    throw Error('Only APP_PUBLIC_ORIGIN is accepted as a public variable');
  }
  const origin = canonicalPublicOrigin(config.vars.APP_PUBLIC_ORIGIN);
  if (origin.port || !new RegExp(`^${config.name}\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.workers\\.dev$`).test(origin.hostname)) {
    throw Error('APP_PUBLIC_ORIGIN must match the fixed Worker/account workers.dev hostname');
  }
  const services = config.vpc_services;
  if (!Array.isArray(services) || services.length !== 1) throw Error('Exactly one PC_APP VPC Service binding required');
  const service = services[0];
  if (!service || service.binding !== 'PC_APP' || service.remote !== true ||
    Object.keys(service).some(key => !['binding', 'service_id', 'remote'].includes(key)) ||
    typeof service.service_id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(service.service_id)) {
    throw Error('Replace the VPC Service ID placeholder for the single PC_APP remote binding');
  }
  if (config.assets !== undefined) {
    const assets = config.assets;
    if (!assets || typeof assets !== 'object' || Array.isArray(assets) ||
        Object.keys(assets).length !== 4 ||
        Object.keys(assets).some(key => !['directory', 'run_worker_first', 'html_handling', 'not_found_handling'].includes(key)) ||
        assets.directory !== './.contingency/static-assets/assets' ||
        assets.run_worker_first !== false || assets.html_handling !== 'none' || assets.not_found_handling !== 'none') {
      throw Error('Use the verified static-assets bundle, asset-first routing, and no HTML fallback');
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const path = resolve(process.argv[2] ?? fileURLToPath(new URL('./wrangler.example.json', import.meta.url)));
    let config;
    try { config = JSON.parse(await readFile(path, 'utf8')); } catch { throw Error('Readable JSON Worker configuration required'); }
    validateConfig(config);
    if (config.assets) {
      const { dirname } = await import('node:path');
      const { verifyAssetsBundle } = await import('./prepare-assets.mjs');
      const manifest = await verifyAssetsBundle(resolve(dirname(path), config.assets.directory, '..'));
      process.stdout.write(`Verified static bundle for ${manifest.current.commit} (${manifest.current.releaseId}).\n`);
    }
    process.stdout.write('Local entry configuration valid; no provider operation performed.\n');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
