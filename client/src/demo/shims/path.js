// Minimal browser stand-in for node:path (POSIX semantics, enough for the server's needs).
const basename = (p) => String(p).split('/').filter(Boolean).pop() ?? '';
const extname = (p) => { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
const join = (...parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');
const dirname = (p) => String(p).split('/').slice(0, -1).join('/') || '/';
const resolve = (...parts) => join('/', ...parts);
const path = { basename, extname, join, dirname, resolve, sep: '/' };
export default path;
export { basename, extname, join, dirname, resolve };
