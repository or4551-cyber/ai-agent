/**
 * CrashShield — comprehensive protection layer for Merlin server
 * 
 * Features:
 * - Memory monitoring + auto-GC
 * - OOM prevention (kill low-priority work before crash)
 * - Agent lifecycle management (max concurrent, auto-cleanup)
 * - execSync wrapper with timeout + error swallowing
 * - Background service error budgets
 * - Self-monitoring health check
 */

import { execSync, spawn } from 'child_process';

// ===== CONFIGURATION =====
const CONFIG = {
  // Memory limits (MB)
  MEMORY_WARNING_MB: 300,
  MEMORY_CRITICAL_MB: 450,
  MEMORY_CHECK_INTERVAL: 30_000, // 30s

  // Agent limits
  MAX_CONCURRENT_AGENTS: 5,
  AGENT_IDLE_TIMEOUT: 10 * 60_000, // 10 min idle → cleanup
  AGENT_MAX_LIFETIME: 60 * 60_000, // 1 hour max

  // Error budgets (per service, per hour)
  ERROR_BUDGET_PER_HOUR: 20,
  ERROR_BUDGET_WINDOW: 60 * 60_000,

  // execSync defaults
  EXEC_DEFAULT_TIMEOUT: 8000,
  EXEC_MAX_OUTPUT: 512 * 1024, // 512KB
};

// ===== MEMORY MONITOR =====
interface MemoryStatus {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  level: 'ok' | 'warning' | 'critical';
  gcRuns: number;
}

let gcRunCount = 0;
let lastGcTime = 0;

function getMemoryStatus(): MemoryStatus {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);

  let level: 'ok' | 'warning' | 'critical' = 'ok';
  if (rssMB >= CONFIG.MEMORY_CRITICAL_MB) level = 'critical';
  else if (rssMB >= CONFIG.MEMORY_WARNING_MB) level = 'warning';

  return { heapUsedMB, heapTotalMB, rssMB, level, gcRuns: gcRunCount };
}

function tryGC(): boolean {
  if (typeof global.gc === 'function') {
    global.gc();
    gcRunCount++;
    lastGcTime = Date.now();
    return true;
  }
  return false;
}

// ===== ERROR BUDGET TRACKER =====
interface ErrorBucket {
  errors: number[];
  paused: boolean;
  pauseUntil: number;
}

const errorBudgets = new Map<string, ErrorBucket>();

function recordServiceError(serviceName: string): boolean {
  let bucket = errorBudgets.get(serviceName);
  if (!bucket) {
    bucket = { errors: [], paused: false, pauseUntil: 0 };
    errorBudgets.set(serviceName, bucket);
  }

  // Clear old errors outside the window
  const cutoff = Date.now() - CONFIG.ERROR_BUDGET_WINDOW;
  bucket.errors = bucket.errors.filter(t => t > cutoff);

  // Check if paused
  if (bucket.paused && Date.now() < bucket.pauseUntil) {
    return false; // Still paused
  }
  bucket.paused = false;

  // Record error
  bucket.errors.push(Date.now());

  // Check budget
  if (bucket.errors.length >= CONFIG.ERROR_BUDGET_PER_HOUR) {
    bucket.paused = true;
    bucket.pauseUntil = Date.now() + 5 * 60_000; // Pause 5 min
    console.warn(`[CrashShield] Service "${serviceName}" exceeded error budget (${bucket.errors.length}/${CONFIG.ERROR_BUDGET_PER_HOUR}). Paused for 5 min.`);
    return false;
  }

  return true; // Budget OK
}

function isServiceAllowed(serviceName: string): boolean {
  const bucket = errorBudgets.get(serviceName);
  if (!bucket) return true;
  if (bucket.paused && Date.now() < bucket.pauseUntil) return false;
  if (bucket.paused) bucket.paused = false;
  return true;
}

// ===== SAFE EXEC =====
export function safeExec(
  cmd: string,
  options: { timeout?: number; fallback?: string; label?: string } = {}
): string {
  const { timeout = CONFIG.EXEC_DEFAULT_TIMEOUT, fallback = '', label = 'exec' } = options;

  try {
    const result = execSync(cmd, {
      timeout,
      stdio: 'pipe',
      maxBuffer: CONFIG.EXEC_MAX_OUTPUT,
      encoding: 'utf-8',
    });
    return result || '';
  } catch (err: any) {
    if (err.killed) {
      console.warn(`[CrashShield] ${label}: command timed out after ${timeout}ms`);
    } else {
      // Don't spam logs — only log if within error budget
      recordServiceError(`exec:${label}`);
    }
    return fallback;
  }
}

// ===== SAFE ASYNC EXEC (non-blocking) =====
export function safeSpawn(
  cmd: string,
  args: string[],
  options: { timeout?: number; label?: string } = {}
): Promise<{ success: boolean; output: string }> {
  const { timeout = 60_000, label = 'spawn' } = options;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ success: false, output: `timeout after ${timeout}ms` });
    }, timeout);

    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString().slice(-1024); });
    child.stderr?.on('data', (d) => { stderr += d.toString().slice(-1024); });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        success: code === 0,
        output: code === 0 ? stdout.slice(-500) : stderr.slice(-500),
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, output: err.message });
    });
  });
}

// ===== AGENT LIFECYCLE MANAGER =====
interface AgentEntry {
  id: string;
  createdAt: number;
  lastActiveAt: number;
}

const agentRegistry = new Map<string, AgentEntry>();

export function registerAgent(id: string): boolean {
  // Enforce max concurrent
  if (agentRegistry.size >= CONFIG.MAX_CONCURRENT_AGENTS) {
    // Try to evict oldest idle agent
    const evicted = evictIdleAgent();
    if (!evicted) {
      console.warn(`[CrashShield] Max agents (${CONFIG.MAX_CONCURRENT_AGENTS}) reached. Cannot create new agent.`);
      return false;
    }
  }

  agentRegistry.set(id, {
    id,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  });
  return true;
}

export function touchAgent(id: string): void {
  const entry = agentRegistry.get(id);
  if (entry) entry.lastActiveAt = Date.now();
}

export function unregisterAgent(id: string): void {
  agentRegistry.delete(id);
}

function evictIdleAgent(): boolean {
  const now = Date.now();
  let oldest: AgentEntry | null = null;

  for (const entry of agentRegistry.values()) {
    if (now - entry.lastActiveAt > CONFIG.AGENT_IDLE_TIMEOUT) {
      if (!oldest || entry.lastActiveAt < oldest.lastActiveAt) {
        oldest = entry;
      }
    }
  }

  if (oldest) {
    console.log(`[CrashShield] Evicting idle agent ${oldest.id} (idle ${Math.round((now - oldest.lastActiveAt) / 1000)}s)`);
    agentRegistry.delete(oldest.id);
    return true;
  }

  // If no idle agents, evict the oldest one that exceeded max lifetime
  for (const entry of agentRegistry.values()) {
    if (now - entry.createdAt > CONFIG.AGENT_MAX_LIFETIME) {
      if (!oldest || entry.createdAt < oldest.createdAt) {
        oldest = entry;
      }
    }
  }

  if (oldest) {
    console.log(`[CrashShield] Evicting expired agent ${oldest.id} (age ${Math.round((now - oldest.createdAt) / 60000)}min)`);
    agentRegistry.delete(oldest.id);
    return true;
  }

  return false;
}

// ===== SAFE WRAPPER FOR SERVICE CALLBACKS =====
export function shieldService<T extends (...args: any[]) => any>(
  serviceName: string,
  fn: T
): T {
  return ((...args: any[]) => {
    if (!isServiceAllowed(serviceName)) {
      return undefined;
    }
    try {
      const result = fn(...args);
      // Handle async
      if (result && typeof result.catch === 'function') {
        return result.catch((err: Error) => {
          console.error(`[CrashShield] ${serviceName} async error:`, err.message);
          recordServiceError(serviceName);
          return undefined;
        });
      }
      return result;
    } catch (err: any) {
      console.error(`[CrashShield] ${serviceName} sync error:`, err.message);
      recordServiceError(serviceName);
      return undefined;
    }
  }) as T;
}

// ===== OOM PREVENTION =====
let oomCallbacks: (() => void)[] = [];

export function onOOMPressure(callback: () => void): void {
  oomCallbacks.push(callback);
}

function handleMemoryPressure(): void {
  const mem = getMemoryStatus();

  if (mem.level === 'critical') {
    console.warn(`[CrashShield] CRITICAL MEMORY: ${mem.rssMB}MB RSS. Running emergency cleanup...`);

    // 1. Force GC
    tryGC();

    // 2. Run all OOM callbacks
    for (const cb of oomCallbacks) {
      try { cb(); } catch {}
    }

    // 3. If still critical after callbacks, pause non-essential services
    const memAfter = getMemoryStatus();
    if (memAfter.level === 'critical') {
      console.error(`[CrashShield] Memory still critical (${memAfter.rssMB}MB) after cleanup. Pausing background services.`);
      for (const [name] of errorBudgets) {
        const bucket = errorBudgets.get(name)!;
        bucket.paused = true;
        bucket.pauseUntil = Date.now() + 10 * 60_000;
      }
    }
  } else if (mem.level === 'warning') {
    // Soft GC
    tryGC();
    console.log(`[CrashShield] Memory warning: ${mem.rssMB}MB RSS. GC triggered.`);
  }
}

// ===== HEALTH STATUS (for self-monitoring) =====
export interface ShieldHealth {
  memory: MemoryStatus;
  agents: { active: number; max: number };
  services: { name: string; errors: number; paused: boolean }[];
  uptime: number;
  startTime: number;
}

const startTime = Date.now();

export function getShieldHealth(): ShieldHealth {
  const services: { name: string; errors: number; paused: boolean }[] = [];
  for (const [name, bucket] of errorBudgets) {
    services.push({
      name,
      errors: bucket.errors.length,
      paused: bucket.paused && Date.now() < bucket.pauseUntil,
    });
  }

  return {
    memory: getMemoryStatus(),
    agents: { active: agentRegistry.size, max: CONFIG.MAX_CONCURRENT_AGENTS },
    services,
    uptime: Date.now() - startTime,
    startTime,
  };
}

// ===== INIT: start monitoring =====
let monitorTimer: NodeJS.Timeout | null = null;

export function startCrashShield(): void {
  console.log('[CrashShield] Protection layer active');
  console.log(`  Memory limits: warn=${CONFIG.MEMORY_WARNING_MB}MB, critical=${CONFIG.MEMORY_CRITICAL_MB}MB`);
  console.log(`  Max agents: ${CONFIG.MAX_CONCURRENT_AGENTS}`);
  console.log(`  Error budget: ${CONFIG.ERROR_BUDGET_PER_HOUR}/hour per service`);

  // Periodic memory check
  monitorTimer = setInterval(() => {
    handleMemoryPressure();

    // Cleanup expired agent entries
    const now = Date.now();
    for (const [id, entry] of agentRegistry) {
      if (now - entry.lastActiveAt > CONFIG.AGENT_IDLE_TIMEOUT) {
        console.log(`[CrashShield] Auto-cleanup idle agent: ${id}`);
        agentRegistry.delete(id);
      }
    }
  }, CONFIG.MEMORY_CHECK_INTERVAL);
  monitorTimer.unref?.();
}

export function stopCrashShield(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}
