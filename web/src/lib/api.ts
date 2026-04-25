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

export async function triggerDigest(): Promise<{ suggestions: Suggestion[]; error?: string }> {
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

// ===== CONVERSATION HISTORY =====

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface FullConversation {
  id: string;
  title: string;
  messages: { id: string; role: 'user' | 'assistant'; content: string; timestamp: number; toolCalls?: any[] }[];
  createdAt: number;
  updatedAt: number;
}

export async function getConversations(limit = 20, offset = 0): Promise<{ conversations: ConversationSummary[]; total: number }> {
  return apiFetch(`/api/conversations?limit=${limit}&offset=${offset}`);
}

export async function getConversation(id: string): Promise<FullConversation> {
  return apiFetch(`/api/conversations/${id}`);
}

export async function saveConversation(conversation: FullConversation): Promise<void> {
  return apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify(conversation) });
}

export async function deleteConversation(id: string): Promise<void> {
  return apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
}

export async function deleteAllConversations(): Promise<void> {
  return apiFetch('/api/conversations', { method: 'DELETE' });
}

// ===== SMART ALERTS =====

export interface SmartAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'low' | 'medium' | 'high';
  actionable: boolean;
  action?: string;
}

export async function getAlerts(unreadOnly = false): Promise<{ alerts: SmartAlert[]; unreadCount: number }> {
  return apiFetch(`/api/alerts${unreadOnly ? '?unread=true' : ''}`);
}

export async function markAlertRead(id: string): Promise<void> {
  return apiFetch(`/api/alerts/read/${id}`, { method: 'POST' });
}

export async function markAllAlertsRead(): Promise<void> {
  return apiFetch('/api/alerts/read-all', { method: 'POST' });
}

// ===== STORAGE SCANNER =====

export interface ScanResult {
  timestamp: string;
  totalFiles: number;
  totalSizeMb: number;
  freeSpaceMb: number;
  duplicates: { hash: string; sizeMb: number; files: string[] }[];
  largeFiles: { path: string; name: string; sizeMb: number; modified: string; category: string }[];
  junkFiles: { path: string; name: string; sizeMb: number; category: string }[];
  cacheFiles: { path: string; name: string; sizeMb: number }[];
  emptyFolders: string[];
  totalSavingsMb: number;
}

export async function getStorageStatus(): Promise<{ scanning: boolean; lastScan: string | null }> {
  return apiFetch('/api/storage/status');
}

export async function getLastScan(): Promise<{ result: ScanResult | null }> {
  return apiFetch('/api/storage/last-scan');
}

export async function startStorageScan(): Promise<{ result: ScanResult }> {
  return apiFetch('/api/storage/scan', { method: 'POST' });
}

export async function clearCache(): Promise<{ freedMb: number }> {
  return apiFetch('/api/storage/clear-cache', { method: 'POST' });
}

export async function deleteEmptyFolders(): Promise<{ deleted: number }> {
  return apiFetch('/api/storage/delete-empty', { method: 'POST' });
}

export async function deleteFiles(paths: string[]): Promise<{ deleted: number; errors: string[] }> {
  return apiFetch('/api/storage/delete-files', { method: 'POST', body: JSON.stringify({ paths }) });
}

// ===== DASHBOARD =====

export async function getDashboard(): Promise<Record<string, unknown>> {
  return apiFetch('/api/dashboard');
}

// ===== PROACTIVE ALERTS =====

export interface ProactiveAlert {
  id: string;
  type: string;
  icon: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
}

export async function getProactiveAlerts(): Promise<{ alerts: ProactiveAlert[]; timestamp: number }> {
  return apiFetch('/api/proactive-alerts');
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

// ===== HEALTH MONITOR =====

export interface HealthStatus {
  currentHeartRate: number | null;
  avgHeartRate: number | null;
  isHeartRateAbnormal: boolean;
  todaySteps: number | null;
  isMoving: boolean;
  sedentaryMinutes: number;
  stressLevel: 'low' | 'medium' | 'high' | 'unknown';
  lastReading: string | null;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  return apiFetch('/api/health');
}

// ===== PROXIMITY / DEVICE SCANNER =====

export interface ProximityStatus {
  isAlone: boolean;
  nearbyDeviceCount: number;
  aloneMinutes: number;
  lastSeen: string | null;
  trend: 'alone_longer' | 'company_arrived' | 'stable';
}

export async function getProximityStatus(): Promise<ProximityStatus> {
  return apiFetch('/api/proximity');
}

// ===== VOICE DAEMON =====

export interface VoiceDaemonStatus {
  mode: 'sleep' | 'wake_word' | 'active';
  active: boolean;
  sessionStart: string | null;
  totalCommands: number;
  lastCommand: string | null;
  lastResponse: string | null;
  silentSeconds: number;
}

export async function getVoiceDaemonStatus(): Promise<VoiceDaemonStatus> {
  return apiFetch('/api/voice-daemon/status');
}

export async function startVoiceDaemon(mode: 'wake_word' | 'active' = 'wake_word'): Promise<{ message: string; status: VoiceDaemonStatus }> {
  return apiFetch('/api/voice-daemon/start', { method: 'POST', body: JSON.stringify({ mode }), headers: { 'Content-Type': 'application/json' } });
}

export async function stopVoiceDaemon(): Promise<{ message: string; status: VoiceDaemonStatus }> {
  return apiFetch('/api/voice-daemon/stop', { method: 'POST' });
}

export async function activateVoiceDaemon(): Promise<{ message: string; status: VoiceDaemonStatus }> {
  return apiFetch('/api/voice-daemon/activate', { method: 'POST' });
}

// ===== CONVERSATION EXPORT =====

export function getExportUrl(id: string): string {
  const token = process.env.NEXT_PUBLIC_AUTH_TOKEN || 'dev-token';
  return `${getBaseUrl()}/api/conversations/${id}/export?format=txt&token=${token}`;
}
