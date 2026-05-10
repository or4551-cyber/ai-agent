#!/usr/bin/env node
// Merlin supervisor — watches the worker, restarts on demand or on crash.
//
// Lifecycle:
//   1. Spawn worker (tsx watch src/server.ts in dev, node dist/server.js in prod)
//   2. Forward its stdout/stderr to ours so logs look identical to running the
//      server directly.
//   3. Poll ~/.ai-agent/restart.flag every second.
//      - If present with op='update': run `git pull && npm install` first.
//      - Then SIGTERM the worker; it drains gracefully and exits.
//      - Spawn a fresh worker.
//   4. If the worker crashes unexpectedly: exponential-backoff restart (max 60s).
//
// This file is plain JS (no compile step) so the supervisor itself never breaks
// because of a TS error in the worker.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME = process.env.HOME || os.homedir();
const FLAG_PATH = path.join(HOME, '.ai-agent', 'restart.flag');
const SUPERVISOR_LOG = path.join(HOME, '.ai-agent', 'supervisor.log');
const POLL_MS = 1000;
const DRAIN_GRACE_MS = 8000; // hard kill if drain takes longer than this
const CRASH_BACKOFF_MS = 1000;
const CRASH_BACKOFF_MAX_MS = 60_000;

const isDev = !fs.existsSync(path.join(__dirname, 'dist', 'server.js'));
const workerCmd = isDev
  ? { cmd: 'npx', args: ['tsx', 'src/server.ts'] }
  : { cmd: 'node', args: ['dist/server.js'] };

let worker = null;
let restartingForOp = null; // null | 'restart' | 'update'
let crashCount = 0;
let lastCrashAt = 0;
let stopping = false;

// Ensure the log directory exists before our first write (otherwise the
// catch-all swallows ENOENT silently and we miss everything until something
// else creates ~/.ai-agent).
try { fs.mkdirSync(path.dirname(SUPERVISOR_LOG), { recursive: true }); } catch {}

const SUPERVISOR_LOG_MAX_BYTES = 5 * 1024 * 1024;
function rotateLogIfNeeded() {
  try {
    if (!fs.existsSync(SUPERVISOR_LOG)) return;
    if (fs.statSync(SUPERVISOR_LOG).size < SUPERVISOR_LOG_MAX_BYTES) return;
    const rotated = SUPERVISOR_LOG + '.1';
    if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
    fs.renameSync(SUPERVISOR_LOG, rotated);
  } catch {}
}

let logWritesSinceRotate = 0;
function log(line) {
  const ts = new Date().toISOString();
  const msg = `[supervisor ${ts}] ${line}\n`;
  process.stdout.write(msg);
  // Cheap amortized rotation check.
  if (++logWritesSinceRotate > 200) {
    logWritesSinceRotate = 0;
    rotateLogIfNeeded();
  }
  try { fs.appendFileSync(SUPERVISOR_LOG, msg); } catch {}
}

function readFlag() {
  try {
    if (!fs.existsSync(FLAG_PATH)) return null;
    return JSON.parse(fs.readFileSync(FLAG_PATH, 'utf-8'));
  } catch (err) {
    log('Failed to read flag: ' + err.message);
    return null;
  }
}

function clearFlag() {
  try { fs.unlinkSync(FLAG_PATH); } catch {}
}

function spawnWorker() {
  log(`Spawning worker (${isDev ? 'dev' : 'prod'}): ${workerCmd.cmd} ${workerCmd.args.join(' ')}`);
  worker = spawn(workerCmd.cmd, workerCmd.args, {
    cwd: __dirname,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, MERLIN_SUPERVISED: '1' },
    shell: process.platform === 'win32', // npx on Windows needs shell
  });

  worker.on('exit', (code, signal) => {
    log(`Worker exited code=${code} signal=${signal}`);
    const now = Date.now();
    if (stopping) return;

    if (restartingForOp) {
      // We asked for this. Perform the post-stop work, then respawn.
      // Always respawn even if handlePostStop throws — staying down because
      // git failed is much worse than running stale code.
      const op = restartingForOp;
      restartingForOp = null;
      handlePostStop(op)
        .catch((e) => log('handlePostStop threw (will respawn anyway): ' + (e && e.message)))
        .then(() => spawnWorker());
      return;
    }

    // Unexpected crash — backoff + restart.
    if (now - lastCrashAt > 60_000) crashCount = 0; // window resets
    crashCount++;
    lastCrashAt = now;
    const backoff = Math.min(CRASH_BACKOFF_MS * Math.pow(2, crashCount - 1), CRASH_BACKOFF_MAX_MS);
    log(`Unexpected crash #${crashCount}, restarting in ${backoff}ms`);
    setTimeout(() => spawnWorker(), backoff);
  });

  worker.on('error', (err) => {
    log('Worker spawn error: ' + err.message);
  });
}

async function handlePostStop(op) {
  if (op === 'update') {
    // Full self-update: pull code, install deps, REBUILD both server (TS→JS)
    // and web (Next.js → static export). Without rebuild the new worker
    // would still run the old dist/server.js and the old web/out/ bundle.
    const repoRoot = path.dirname(__dirname);
    const webDir = path.join(repoRoot, 'web');
    log('Self-update: git pull');
    try {
      await runSync('git', ['pull', '--ff-only'], { cwd: repoRoot });
    } catch (err) {
      log('git pull failed (continuing anyway): ' + err.message);
    }
    log('Self-update: npm install (server)');
    try { await runSync('npm', ['install'], { cwd: __dirname }); } catch (err) {
      log('server npm install failed: ' + err.message);
    }
    log('Self-update: npm run build (server)');
    try { await runSync('npm', ['run', 'build'], { cwd: __dirname }); } catch (err) {
      log('server build failed (will run old dist): ' + err.message);
    }
    if (fs.existsSync(path.join(webDir, 'package.json'))) {
      log('Self-update: npm install (web)');
      try { await runSync('npm', ['install'], { cwd: webDir }); } catch (err) {
        log('web npm install failed: ' + err.message);
      }
      log('Self-update: npm run build (web) — this is the slowest step');
      try { await runSync('npm', ['run', 'build'], { cwd: webDir }); } catch (err) {
        log('web build failed (frontend may be stale): ' + err.message);
      }
    }
    log('Self-update complete');
  }
}

function runSync(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      ...opts,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

function requestWorkerStop(op) {
  if (!worker || worker.killed) return;
  restartingForOp = op || 'restart';
  log(`Sending SIGTERM (op=${restartingForOp})`);
  try { worker.kill('SIGTERM'); } catch {}
  // Hard-kill fallback if drain takes too long.
  setTimeout(() => {
    if (worker && !worker.killed && restartingForOp) {
      log('Drain exceeded grace — SIGKILL');
      try { worker.kill('SIGKILL'); } catch {}
    }
  }, DRAIN_GRACE_MS);
}

function pollFlag() {
  if (stopping) return;
  const flag = readFlag();
  if (flag) {
    if (restartingForOp) {
      // A restart is already in progress (worker draining, or post-stop work
      // running). Leave the flag in place; we'll pick it up on the next poll
      // once the current op completes. Without this, a second flag arriving
      // mid-update would be silently discarded.
    } else if (!worker || worker.killed) {
      // Worker isn't alive yet (still in handlePostStop or initial spawn).
      // Keep the flag; we'll handle it once the worker is up.
    } else {
      log(`Flag detected: reason="${flag.reason}" op=${flag.op || 'restart'}`);
      clearFlag();
      requestWorkerStop(flag.op || 'restart');
    }
  }
  setTimeout(pollFlag, POLL_MS);
}

// Pass through Ctrl-C / SIGTERM to the worker so it can drain.
process.on('SIGINT', () => {
  stopping = true;
  log('Supervisor SIGINT — forwarding to worker');
  if (worker) try { worker.kill('SIGTERM'); } catch {}
  setTimeout(() => process.exit(0), DRAIN_GRACE_MS);
});
process.on('SIGTERM', () => {
  stopping = true;
  log('Supervisor SIGTERM — forwarding to worker');
  if (worker) try { worker.kill('SIGTERM'); } catch {}
  setTimeout(() => process.exit(0), DRAIN_GRACE_MS);
});

log('=== Merlin supervisor starting ===');
spawnWorker();
pollFlag();
