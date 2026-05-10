// Audit log — append-only JSONL of every dangerous/moderate tool execution.
//
// Why: the agent runs with broad device permissions. When something goes wrong
// (a deleted file, an SMS to the wrong contact, an unexpected git push),
// the user needs a forensic trail that says: "at HH:MM, tool X ran with input Y,
// returned Z, was approved=true." The audit log is the answer.
//
// Format: JSONL — one JSON object per line. Robust against partial writes:
// truncated lines are simply skipped on read.
//
// Rotation: file is capped at AUDIT_MAX_BYTES; older entries roll into
// audit.log.1 (single rotation, "good enough" for a phone agent).

import * as fs from 'fs';
import * as path from 'path';
import { DangerLevel } from '../types';

const HOME = process.env.HOME || '.';
const DIR = path.join(HOME, '.ai-agent');
const FILE = path.join(DIR, 'audit.log');
const ROTATED = path.join(DIR, 'audit.log.1');
const AUDIT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface AuditEntry {
  ts: number;
  toolName: string;
  dangerLevel: DangerLevel;
  approved: boolean;
  durationMs: number;
  // Truncated to keep the file manageable. Full content remains in conversation history.
  inputPreview: string;
  outputPreview: string;
  outcome: 'success' | 'error';
  errorMsg?: string;
  conversationId?: string;
}

function ensureDir(): void {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function rotateIfNeeded(): void {
  try {
    if (!fs.existsSync(FILE)) return;
    const stat = fs.statSync(FILE);
    if (stat.size < AUDIT_MAX_BYTES) return;
    if (fs.existsSync(ROTATED)) fs.unlinkSync(ROTATED);
    fs.renameSync(FILE, ROTATED);
  } catch (err) {
    console.error('[Audit] Rotation failed (non-fatal):', (err as Error).message);
  }
}

function preview(s: string, max = 500): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function recordToolExecution(entry: AuditEntry): void {
  // Only persist moderate/dangerous — `safe` is high-volume noise (read_file, list_directory…)
  if (entry.dangerLevel === 'safe') return;
  try {
    ensureDir();
    rotateIfNeeded();
    fs.appendFileSync(FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[Audit] Append failed (non-fatal):', (err as Error).message);
  }
}

export function readRecent(limit = 50): AuditEntry[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    const lines = fs.readFileSync(FILE, 'utf-8').trim().split('\n');
    const tail = lines.slice(-limit);
    const result: AuditEntry[] = [];
    for (const line of tail) {
      if (!line) continue;
      try {
        result.push(JSON.parse(line));
      } catch {
        // Skip truncated/corrupt lines.
      }
    }
    return result.reverse(); // newest first
  } catch {
    return [];
  }
}

export function buildEntry(args: {
  toolName: string;
  dangerLevel: DangerLevel;
  approved: boolean;
  startedAt: number;
  input: Record<string, unknown>;
  output: string;
  outcome: 'success' | 'error';
  errorMsg?: string;
  conversationId?: string;
}): AuditEntry {
  return {
    ts: args.startedAt,
    toolName: args.toolName,
    dangerLevel: args.dangerLevel,
    approved: args.approved,
    durationMs: Date.now() - args.startedAt,
    inputPreview: preview(JSON.stringify(args.input)),
    outputPreview: preview(args.output),
    outcome: args.outcome,
    errorMsg: args.errorMsg,
    conversationId: args.conversationId,
  };
}
