// A small, Express-compatible router that runs in the browser.
// It supports exactly what the ICMS server uses: Router(), get/post/delete/use, :params,
// path-prefixed mounting, middleware chains, (err, req, res, next) handlers and async handlers.

const compile = (pattern) => {
  const keys = [];
  const src = pattern.replace(/\/:([A-Za-z0-9_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; });
  return { re: new RegExp(`^${src}/?$`), keys };
};

function createRouter() {
  const stack = [];
  const add = (method, path, fns) => {
    for (const fn of fns.flat()) stack.push({ method, path, fn, route: path && method ? compile(path) : null });
  };
  const router = (req, res, next) => router.handle(req, res, next);
  router.get = (path, ...fns) => (add('GET', path, fns), router);
  router.post = (path, ...fns) => (add('POST', path, fns), router);
  router.delete = (path, ...fns) => (add('DELETE', path, fns), router);
  router.use = (...args) => {
    const path = typeof args[0] === 'string' ? args.shift() : null;
    add(null, path, args);
    return router;
  };
  router.disable = () => router;
  router.set = () => router;

  router.handle = (req, res, done) => {
    let i = 0;
    const next = (err) => {
      if (res.finished) return;
      const layer = stack[i++];
      if (!layer) return done(err);
      const p = req.path;
      let restore = null;
      if (layer.method) {
        if (layer.method !== req.method) return next(err);
        const m = layer.route.re.exec(p);
        if (!m) return next(err);
        req.params = Object.fromEntries(layer.route.keys.map((k, j) => [k, decodeURIComponent(m[j + 1])]));
      } else if (layer.path) {
        if (p !== layer.path && !p.startsWith(layer.path + '/')) return next(err);
        const saved = req.path;
        req.path = p.slice(layer.path.length) || '/';
        restore = () => { req.path = saved; };
      }
      const call = (fn, ...a) => {
        try {
          const r = fn(...a);
          if (r && typeof r.then === 'function') r.then(undefined, (e) => { restore?.(); next(e); });
        } catch (e) { restore?.(); next(e); }
      };
      const nextAfter = (e) => { restore?.(); next(e); };
      const fn = layer.fn;
      if (err) {
        if (fn.length === 4) call(fn, err, req, res, nextAfter); else nextAfter(err);
      } else if (fn.length === 4) nextAfter();
      else if (typeof fn.handle === 'function') call(fn.handle, req, res, nextAfter);
      else call(fn, req, res, nextAfter);
    };
    next();
  };
  return router;
}

function express() { return createRouter(); }
express.Router = createRouter;
express.json = () => (_req, _res, next) => next();
express.static = () => (_req, _res, next) => next();
export default express;
