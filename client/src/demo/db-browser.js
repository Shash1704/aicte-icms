// Browser replacement for server/src/db.js: same helpers, no file system.
export * from '../../../server/src/dbutil.js';
export const DATA_DIR = '/data';
export const UPLOAD_DIR = '/uploads';
export const DB_PATH = ':browser:';
export function openDb() { throw new Error('openDb is not available in the browser demo'); }
