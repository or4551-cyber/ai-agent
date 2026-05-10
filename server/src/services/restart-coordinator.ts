// Restart coordinator — handles the "Merlin updates itself" lifecycle.
//
// Flow:
//   1. Some code path (self_update tool, system_restart tool, supervisor watchdog)
//      calls scheduleRestart(reason). It writes a flag file.
//   2. The supervisor (server/supervisor.js, separate process) polls the flag.
//   3. When found, supervisor sends SIGTERM to this worker.
//   4. Our SIGTERM handler runs onShutdown():
//        - Broadcasts restart_imminent to all WS clients
//        - Waits up to DRAIN_MS for in-flight tool calls to settle
//        - Calls every registered drain handler (saves sessions, reminders, etc)
//        - Exits cleanly
//   5. Supervisor performs the update (git pull, npm install, etc.) per flag's `op` field.
//   6. Supervisor spawns a fresh worker.
//   7. Web clients auto-reconnect (existing logic). Their conversationId
//      triggers session restore — they pick up exactly where they left off.

import * as fs from 'fs';
import * as path from 'path';

const HOME = process.env.HOME || '.';
const FLAG_PATH = path.join(HOME, '.ai-agent', 'restart.flag');
const STATE_PATH = path.join(HOME, '.ai-agent', 'last-restart.json');

// How long we give in-flight work before forcing exit.
const DRAIN_MS = 5000;

export interface RestartFlag {
  reason: string;
  op: 'restart' | 'update'; // restart only, or pull+install+restart
  requestedAt: number;
  requestedBy?: string; // 'tool', 'supervisor', 'manual'
}

type DrainHandler = () => Promise<void> | void;
type BroadcastHandler = (event: { type: string; payload: Record<string, unknown> }) => void;

class RestartCoordinator {
  private drainHandlers: DrainHandler[] = [];
  private broadcast: BroadcastHandler | null = null;
  private draining = false;
  private installed = false;
  // Dedupe restart_imminent broadcasts. scheduleRestart fires one when the
  // flag is written; drain() fires another on SIGTERM. Without this guard
  // the UI shows the "Merlin is updating" note twice per self-update.
  private alreadyAnnounced = false;

  install(broadcast: BroadcastHandler): void {
    if (this.installed) return;
    this.installed = true;
    this.broadcast = broadcast;

    const onSignal = (sig: string) => {
      console.log(`[Restart] Received ${sig} — beginning graceful drain`);
      this.drain('signal:' + sig).then(() => process.exit(0)).catch((e) => {
        console.error('[Restart] Drain error:', e);
        process.exit(1);
      });
    };
    process.on('SIGTERM', () => onSignal('SIGTERM'));
    process.on('SIGINT', () => onSignal('SIGINT'));
  }

  onDrain(handler: DrainHandler): void {
    this.drainHandlers.push(handler);
  }

  isDraining(): boolean {
    return this.draining;
  }

  // Called from tools. Writes flag file — supervisor picks it up.
  scheduleRestart(reason: string, op: 'restart' | 'update' = 'restart', requestedBy = 'tool'): void {
    const flag: RestartFlag = { reason, op, requestedAt: Date.now(), requestedBy };
    fs.mkdirSync(path.dirname(FLAG_PATH), { recursive: true });
    fs.writeFileSync(FLAG_PATH, JSON.stringify(flag, null, 2));
    console.log(`[Restart] Flag written: ${reason} (op=${op})`);
    // Notify clients early so the UI can show "Merlin is updating..."
    if (this.broadcast && !this.alreadyAnnounced) {
      this.alreadyAnnounced = true;
      this.broadcast({
        type: 'restart_imminent',
        payload: {
          reason,
          op,
          // For 'update' ops the supervisor also runs git pull + npm install +
          // build before respawning, so the real ETA is much longer than DRAIN_MS.
          etaMs: op === 'update' ? 180_000 : DRAIN_MS + 2000,
          willResume: true,
        },
      });
    }
  }

  // Save a record of the *previous* run so the next worker can show
  // "Merlin restarted at HH:MM (reason: X)" on first contact.
  recordRestartCompletion(wasGraceful: boolean = true): void {
    try {
      const state = {
        completedAt: Date.now(),
        wasGraceful,
      };
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch {}
  }

  getLastRestart(): { completedAt: number; wasGraceful: boolean } | null {
    try {
      if (!fs.existsSync(STATE_PATH)) return null;
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    } catch {
      return null;
    }
  }

  // Run all registered drain handlers in parallel, with a hard deadline.
  // Reports wasGraceful=true ONLY if all handlers settled before the timer ran out.
  private async drain(reason: string): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    if (this.broadcast && !this.alreadyAnnounced) {
      this.alreadyAnnounced = true;
      this.broadcast({
        type: 'restart_imminent',
        payload: { reason, etaMs: DRAIN_MS, willResume: true, draining: true },
      });
    }

    let completedNaturally = false;
    const tasks = Promise.all(this.drainHandlers.map(async (h) => {
      try { await h(); } catch (err) {
        console.error('[Restart] Drain handler failed (non-fatal):', (err as Error).message);
      }
    })).then(() => { completedNaturally = true; });

    const deadline = new Promise<void>((resolve) => setTimeout(resolve, DRAIN_MS));
    await Promise.race([tasks, deadline]);
    this.recordRestartCompletion(completedNaturally);
    console.log(`[Restart] Drain complete (graceful=${completedNaturally})`);
  }
}

export const restartCoordinator = new RestartCoordinator();
