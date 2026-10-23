// Browser stand-in for the bits of node:crypto the server routes use (random file names).
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export function randomBytes(n) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(n));
  return { toString: (enc) => (enc === 'hex' ? hex(bytes) : String.fromCharCode(...bytes)) };
}
export default { randomBytes };
