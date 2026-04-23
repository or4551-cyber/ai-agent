const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';

function getBaseUrl() {
  if (typeof window === 'undefined') return 'http://localhost:3002';
  return window.location.origin;
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

export interface DirListing {
  path: string;
  parent: string;
  items: FileItem[];
}

export async function listFiles(dirPath?: string): Promise<DirListing> {
  const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
  return apiFetch(`/api/files${params}`);
}

export async function readFileContent(filePath: string): Promise<{ path: string; content: string; size: number }> {
  return apiFetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
}

export async function writeFileContent(filePath: string, content: string): Promise<{ success: boolean }> {
  return apiFetch('/api/files/write', {
    method: 'POST',
    body: JSON.stringify({ path: filePath, content }),
  });
}

export async function deleteFile(filePath: string): Promise<{ success: boolean }> {
  return apiFetch(`/api/files?path=${encodeURIComponent(filePath)}`, {
    method: 'DELETE',
  });
}

// ===== BRIEFING =====

export async function getBriefing(): Promise<Record<string, unknown>> {
  return apiFetch('/api/briefing');
}

// ===== REMINDERS =====

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  createdAt: string;
  done: boolean;
}

export async function getReminders(): Promise<{ reminders: Reminder[] }> {
  return apiFetch('/api/reminders');
}

export async function addReminder(text: string, dueAt: string): Promise<Reminder> {
  return apiFetch('/api/reminders', {
    method: 'POST',
    body: JSON.stringify({ text, dueAt }),
  });
}

export async function completeReminder(id: string): Promise<void> {
  return apiFetch(`/api/reminders/${id}/complete`, { method: 'POST' });
}

export async function deleteReminder(id: string): Promise<void> {
  return apiFetch(`/api/reminders/${id}`, { method: 'DELETE' });
}

// ===== ROUTINES =====

export interface RoutineItem {
  id: string;
  name: string;
  schedule: string;
  action: { type: string; [key: string]: unknown };
  enabled: boolean;
  lastRun: string | null;
}

export async function getRoutines(): Promise<{ routines: RoutineItem[] }> {
  return apiFetch('/api/routines');
}

export async function addRoutine(name: string, schedule: string, action: Record<string, unknown>): Promise<RoutineItem> {
  return apiFetch('/api/routines', {
    method: 'POST',
    body: JSON.stringify({ name, schedule, action }),
  });
}

export async function toggleRoutine(id: string): Promise<void> {
  return apiFetch(`/api/routines/${id}/toggle`, { method: 'POST' });
}

export async function deleteRoutine(id: string): Promise<void> {
  return apiFetch(`/api/routines/${id}`, { method: 'DELETE' });
}

// ===== OBSERVER =====

export interface Suggestion {
  emoji: string;
  title: string;
  description: string;
  actionable: boolean;
}

export async function getObserverStatus(): Promise<Record<string, unknown>> {
  return apiFetch('/api/observer/status');
}

export async function getSuggestions(): Promise<{ suggestions: Suggestion[] }> {
  return apiFetch('/api/observer/suggestions');
}

export async function triggerDigest(): Promise<{ suggestions: Suggestion[] }> {
  return apiFetch('/api/observer/digest', { method: 'POST' });
}

// ===== USER PROFILE =====

export interface UserProfile {
  name: string | null;
  language: string;
  preferences: { key: string; value: string; confidence: number; source: string }[];
  activeHours: number[];
  topTools: { tool: string; count: number }[];
  topTopics: { topic: string; count: number }[];
  recentConversations: { id: string; timestamp: string; topics: string[]; sentiment: string }[];
  style: { verbosity: string; techLevel: string; tone: string };
  totalConversations: number;
  totalMessages: number;
  firstSeen: string;
  lastSeen: string;
}

export async function getUserProfile(): Promise<UserProfile> {
  return apiFetch('/api/profile');
}

export async function setProfileName(name: string): Promise<void> {
  return apiFetch('/api/profile/name', { method: 'POST', body: JSON.stringify({ name }) });
}

export async function setProfilePreference(key: string, value: string): Promise<void> {
  return apiFetch('/api/profile/preference', { method: 'POST', body: JSON.stringify({ key, value }) });
}

// ===== DASHBOARD =====

export async function getDashboard(): Promise<Record<string, unknown>> {
  return apiFetch('/api/dashboard');
}

// ===== GALLERY =====

export interface GalleryImage {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export async function listGallery(dirPath?: string, limit?: number): Promise<{ path: string; count: number; images: GalleryImage[] }> {
  const params = new URLSearchParams();
  if (dirPath) params.set('path', dirPath);
  if (limit) params.set('limit', String(limit));
  return apiFetch(`/api/gallery?${params}`);
}

export function getImageUrl(imagePath: string): string {
  const token = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';
  const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3002';
  return `${base}/api/gallery/image?path=${encodeURIComponent(imagePath)}&token=${token}`;
}
