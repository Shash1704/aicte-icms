// Runs the API server (with auto-reload) and the Vite dev server together.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['--prefix', 'server', 'run', 'dev'], { stdio: 'inherit', env: { ...process.env, PORT: process.env.API_PORT || '4000' } }),
  spawn('npm', ['--prefix', 'client', 'run', 'dev', '--', '--host'], { stdio: 'inherit' }),
];
const stop = () => { for (const p of procs) p.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) { console.error(`process exited with ${code}`); stop(); } });
