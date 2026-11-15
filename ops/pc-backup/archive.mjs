import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

// TUATPC01 framing: magic(8) + iv(12) + GCM tag(16) + ciphertext. ops/local-minimal/backup-codec.mjs uses the same framing.
export function encryptBackup(bytes, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from('TUATPC01'), iv, cipher.getAuthTag(), encrypted]);
}
export function decryptBackup(bytes, key) {
  if (bytes.subarray(0, 8).toString() !== 'TUATPC01') throw new Error('Invalid backup format');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), bytes.subarray(8, 20));
  decipher.setAuthTag(bytes.subarray(20, 36));
  return Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]);
}
export function verifyRecovery(bytes, dump, instanceId) {
  const value = JSON.parse(bytes.toString('utf8'));
  if (value.version !== 1 || value.instanceId !== instanceId || !Array.isArray(value.vault) ||
      typeof value.cron?.installed !== 'boolean' || !Array.isArray(value.cron?.jobs) ||
      (value.pushEnv !== null && typeof value.pushEnv !== 'string') ||
      value.databaseDumpSha256 !== createHash('sha256').update(dump).digest('hex')) throw new Error('Recovery metadata does not match database backup');
  return value;
}
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function encryptedPair({dump,recovery,instanceId,key,stamp}) {
  if(!Buffer.isBuffer(dump)||dump.length<6||dump.subarray(0,5).toString()!=='PGDMP') throw Error('Incomplete database dump');
  const metadata={...recovery,instanceId,databaseDumpSha256:sha256(dump)};
  const recoveryBytes=encryptBackup(Buffer.from(JSON.stringify(metadata)),key);
  verifyRecovery(decryptBackup(recoveryBytes,key),dump,instanceId);
  const bytes=encryptBackup(dump,key);
  if(!decryptBackup(bytes,key).equals(dump)) throw Error('Backup encryption verification failed');
  const objectKey=`ops/pc-backend/${instanceId}/backups/${stamp}.dump.enc`;
  return {bytes,recoveryBytes,key:objectKey,recoveryKey:objectKey.replace('.dump.enc','.recovery.json.enc'),sha256:sha256(bytes),recoverySha256:sha256(recoveryBytes)};
}
