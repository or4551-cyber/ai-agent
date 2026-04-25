/**
 * Service registry — single source of truth for shared service instances.
 *
 * Many services own data files on disk (reminders.json, routines.json, ...).
 * Creating multiple instances causes:
 *   - duplicate disk reads on startup
 *   - lost-update races on writes
 *   - inconsistent in-memory state between server.ts and tool-executor.ts
 *
 * Anyone who needs a service should import the singleton from here.
 */

import { ReminderService } from './reminders';
import { RoutineService } from './routines';
import { StorageScanner } from './storage-scanner';
import { BackupService } from './backup';
import { FavoritesService } from './favorites';
import { UserProfileService } from './user-profile';
import { ConversationHistoryService } from './conversation-history';
import { SmartAlertsService } from './smart-alerts';
import { AgentMemory } from '../agent/memory';

export const reminderService = new ReminderService();
export const routineService = new RoutineService();
export const storageScanner = new StorageScanner();
export const backupService = new BackupService();
export const favoritesService = new FavoritesService();
export const userProfileService = new UserProfileService();
export const conversationHistoryService = new ConversationHistoryService();
export const smartAlertsService = new SmartAlertsService();
export const agentMemory = new AgentMemory();
