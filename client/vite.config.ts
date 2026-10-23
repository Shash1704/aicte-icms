import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import path from 'node:path'

const SERVER_SRC = path.resolve(__dirname, '../server/src')
const DEMO = path.resolve(__dirname, 'src/demo')

/**
 * Lets the real server code (../server/src) run in the browser for the static GitHub Pages demo:
 * imports of Node-only modules made *from the server folder* are redirected to browser stand-ins.
 */
function browserServer(): Plugin {
  const local: Record<string, string> = { './db.js': 'db-browser.js', './auth.js': 'auth-browser.js' }
  const shims: Record<string, string> = {
    express: 'shims/express.js', multer: 'shims/multer.js', 'node:fs': 'shims/fs.js', 'node:path': 'shims/path.js',
    'node:crypto': 'shims/crypto.js', 'node:url': 'shims/url.js',
  }
  return {
    name: 'icms-browser-server',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer) return null
      const fromServer = importer.startsWith(SERVER_SRC)
      const fromDemo = importer.startsWith(DEMO)
      if (fromServer && local[source]) return path.join(DEMO, local[source])
      if ((fromServer || fromDemo) && shims[source]) return path.join(DEMO, shims[source])
      if (fromServer && source === 'node:events') return this.resolve('events', path.join(DEMO, 'server.js'))
      return null
    },
  }
}

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    // GitHub Pages serves the demo from /<repo>/; the normal build is served from the site root.
    base: demo ? (process.env.PAGES_BASE ?? '/aicte-icms/') : '/',
    plugins: [react(), tailwindcss(), browserServer()],
    define: demo ? { 'process.env': '{}' } : {},
    server: {
      port: 5173,
      proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
      fs: { allow: ['..'] },
    },
    build: { chunkSizeWarningLimit: 1600, outDir: demo ? 'dist-demo' : 'dist' },
  }
})
