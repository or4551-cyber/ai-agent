import { DeviceSnapshot } from './snapshot';

export interface Pattern {
  type: string;
  description: string;
  frequency: number;
  data: Record<string, unknown>;
}

export interface AnalysisResult {
  patterns: Pattern[];
  stats: {
    totalSnapshots: number;
    avgBattery: number;
    avgMemory: number;
    topNotificationApps: { app: string; count: number }[];
    clipboardRepetitions: { text: string; count: number }[];
    frequentFiles: { name: string; count: number }[];
    batteryDrainRate: number; // % per hour
  };
}

export function analyzePatterns(snapshots: DeviceSnapshot[]): AnalysisResult {
  const patterns: Pattern[] = [];

  if (snapshots.length < 2) {
    return {
      patterns: [],
      stats: {
        totalSnapshots: snapshots.length,
        avgBattery: 0, avgMemory: 0,
        topNotificationApps: [], clipboardRepetitions: [],
        frequentFiles: [], batteryDrainRate: 0,
      },
    };
  }

  // === STATS ===

  // Average battery
  const batteryReadings = snapshots.filter(s => s.battery).map(s => s.battery!.percentage);
  const avgBattery = batteryReadings.length
    ? Math.round(batteryReadings.reduce((a, b) => a + b, 0) / batteryReadings.length)
    : 0;

  // Battery drain rate (% per hour)
  let batteryDrainRate = 0;
  if (batteryReadings.length >= 2) {
    const first = snapshots.find(s => s.battery)!;
    const last = [...snapshots].reverse().find(s => s.battery)!;
    const hours = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 3600000;
    if (hours > 0) {
      batteryDrainRate = Math.round(((first.battery!.percentage - last.battery!.percentage) / hours) * 10) / 10;
    }
  }

  // Average memory
  const avgMemory = Math.round(snapshots.reduce((a, s) => a + s.memoryUsage, 0) / snapshots.length);

  // Notification app frequency
  const notifCounts = new Map<string, number>();
  for (const s of snapshots) {
    for (const n of s.notifications) {
      notifCounts.set(n.app, (notifCounts.get(n.app) || 0) + 1);
    }
  }
  const topNotificationApps = [...notifCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([app, count]) => ({ app, count }));

  // Clipboard repetitions
  const clipCounts = new Map<string, number>();
  for (const s of snapshots) {
    if (s.clipboard && s.clipboard.length > 3) {
      const key = s.clipboard.substring(0, 100);
      clipCounts.set(key, (clipCounts.get(key) || 0) + 1);
    }
  }
  const clipboardRepetitions = [...clipCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));

  // Frequent files
  const fileCounts = new Map<string, number>();
  for (const s of snapshots) {
    for (const f of s.recentFiles) {
      fileCounts.set(f.name, (fileCounts.get(f.name) || 0) + 1);
    }
  }
  const frequentFiles = [...fileCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // === PATTERN DETECTION ===

  // High battery drain
  if (batteryDrainRate > 15) {
    patterns.push({
      type: 'battery_drain',
      description: `Battery draining fast: ${batteryDrainRate}%/hour`,
      frequency: 1,
      data: { rate: batteryDrainRate },
    });
  }

  // Notification spam (>20 from one app)
  for (const { app, count } of topNotificationApps) {
    if (count > 20) {
      patterns.push({
        type: 'notification_spam',
        description: `${app} sent ${count} notifications today`,
        frequency: count,
        data: { app, count },
      });
    }
  }

  // Clipboard repetition (user copies same thing 3+ times)
  for (const { text, count } of clipboardRepetitions) {
    if (count >= 3) {
      patterns.push({
        type: 'repeated_clipboard',
        description: `Copied "${text.substring(0, 40)}..." ${count} times`,
        frequency: count,
        data: { text, count },
      });
    }
  }

  // High memory usage
  if (avgMemory > 85) {
    patterns.push({
      type: 'high_memory',
      description: `Average memory usage: ${avgMemory}%`,
      frequency: 1,
      data: { avgMemory },
    });
  }

  return {
    patterns,
    stats: {
      totalSnapshots: snapshots.length,
      avgBattery,
      avgMemory,
      topNotificationApps,
      clipboardRepetitions,
      frequentFiles,
      batteryDrainRate,
    },
  };
}
