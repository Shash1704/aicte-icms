// Wraps a sql.js database in the node:sqlite (DatabaseSync) API the server code is written against:
// db.exec(sql), db.prepare(sql).get/all/run(...params) → { changes, lastInsertRowid }.
const norm = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

export class SqliteAdapter {
  constructor(SQL, bytes) {
    this.SQL = SQL;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.cache = new Map();
    this.pragmas();
  }
  pragmas() { this.db.exec('PRAGMA foreign_keys = ON;'); }
  exec(sql) { this.db.exec(sql); }
  stmt(sql) {
    let st = this.cache.get(sql);
    if (!st) {
      st = this.db.prepare(sql);
      if (this.cache.size > 400) { const [k, old] = this.cache.entries().next().value; old.free(); this.cache.delete(k); }
      this.cache.set(sql, st);
    }
    return st;
  }
  prepare(sql) {
    const self = this;
    return {
      all(...params) {
        const st = self.stmt(sql);
        st.bind(norm(params));
        const rows = [];
        while (st.step()) rows.push(st.getAsObject());
        st.reset();
        return rows;
      },
      get(...params) {
        const st = self.stmt(sql);
        st.bind(norm(params));
        const row = st.step() ? st.getAsObject() : undefined;
        st.reset();
        return row;
      },
      run(...params) {
        const st = self.stmt(sql);
        st.bind(norm(params));
        st.step();
        st.reset();
        const changes = self.db.getRowsModified();
        const id = self.stmt('SELECT last_insert_rowid() AS id');
        id.step();
        const lastInsertRowid = id.getAsObject().id;
        id.reset();
        return { changes, lastInsertRowid };
      },
    };
  }
  /** Serialise the whole database (sql.js frees prepared statements while doing this). */
  export() {
    for (const st of this.cache.values()) st.free();
    this.cache.clear();
    const bytes = this.db.export();
    this.pragmas();
    return bytes;
  }
  close() { this.db.close(); }
}
