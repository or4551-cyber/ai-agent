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

// Cheap, bounded JSON-ish stringify. Avoids JSON.stringify on multi-MB
// values (e.g. base64 image blobs forwarded into a tool input) — that
// burns CPU + memory just to produce a 500-char preview anyway.
function previewInput(input: Record<string, unknown>, max = 500): string {
  const parts: string[] = [];
  let totalLen = 0;
  for (const [k, v] of Object.entries(input)) {
    let s: string;
    if (v === null || v === undefined) {
      s = String(v);
    } else if (typeof v === 'string') {
      s = v.length > 200 ? v.slice(0, 200) + `…(${v.length} chars)` : v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      s = String(v);
    } else {
      // Object / array: stringify but with a hard cap before the full JSON
      // walk balloons.
      try {
        const j = JSON.stringify(v);
        s = j.length > 200 ? j.slice(0, 200) + `…(${j.length} chars)` : j;
      } catch {
        s = '[unserializable]';
      }
    }
    parts.push(`${k}=${s}`);
    totalLen += parts[parts.length - 1].length;
    if (totalLen > max) break;
  }
  return preview(parts.join(' '), max);
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
    inputPreview: previewInput(args.input),
    outputPreview: preview(args.output),
    outcome: args.outcome,
    errorMsg: args.errorMsg,
    conversationId: args.conversationId,
  };
}
