// Browser stand-in for node:fs. The demo keeps documents in the database, so the file system is a no-op.
const fs = {
  existsSync: () => true,
  mkdirSync() {},
  writeFileSync() {},
  readdirSync: () => [],
  rmSync() {},
};
export default fs;
export const { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } = fs;
