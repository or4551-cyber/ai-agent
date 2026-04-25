import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const HEALTH_FILE = path.join(DATA_DIR, 'health-data.json');
const CHECK_INTERVAL = 5 * 60 * 1000; // Every 5 minutes
const MAX_RECORDS = 288; // 24 hours

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export interface HealthReading {
  timestamp: string;
  heartRate: number | null;
  steps: number | null;
  accelerometer: { x: number; y: number; z: number } | null;
  isMoving: boolean;
  stressIndicator: 'low' | 'medium' | 'high' | 'unknown';
}

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

export class HealthMonitor {
  private timer: NodeJS.Timeout | null = null;
  private readings: HealthReading[] = [];
  private running = false;
  private availableSensors: string[] = [];

  constructor() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    this.loadReadings();
  }

  private loadReadings(): void {
    try {
      if (fs.existsSync(HEALTH_FILE)) {
        this.readings = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf-8'));
      }
    } catch { this.readings = []; }
  }

  private saveReadings(): void {
    try {
      fs.writeFileSync(HEALTH_FILE, JSON.stringify(this.readings.slice(-MAX_RECORDS)), 'utf-8');
    } catch {}
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[HealthMonitor] Starting (check every 5 min)');

    // Discover available sensors
    this.discoverSensors();

    // First reading
    this.collect();

    // Periodic readings
    this.timer = setInterval(() => this.collect(), CHECK_INTERVAL);
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // ===== SENSOR DISCOVERY =====
  private discoverSensors(): void {
    this.availableSensors = safe(() => {
      const raw = execSync('termux-sensor -l 2>/dev/null', { timeout: 5000 }).toString();
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data.sensors)) return data.sensors as string[];
      } catch {}
      return [];
    }, []);
    console.log(`[HealthMonitor] Sensors found: ${this.availableSensors.length}`);
  }

  // ===== SAMSUNG HEALTH NOTIFICATION SCRAPING =====
  private samsungHealthCache: { heartRate: number | null; steps: number | null; ts: number } = { heartRate: null, steps: null, ts: 0 };

  private readSamsungHealthNotifications(): void {
    // Cache for 60 seconds to avoid spamming
    if (Date.now() - this.samsungHealthCache.ts < 60000 && (this.samsungHealthCache.heartRate || this.samsungHealthCache.steps)) return;

    safe(() => {
      const raw = execSync('termux-notification-list 2>/dev/null', { timeout: 8000 }).toString();
      const notifications = JSON.parse(raw);
      if (!Array.isArray(notifications)) return;

      for (const n of notifications) {
        const pkg = (n.packageName || '') as string;
        const title = (n.title || '') as string;
        const content = (n.content || '') as string;
        const text = `${title} ${content}`;

        // Samsung Health notifications — match broader package names
        if (pkg.includes('shealth') || pkg.includes('samsung.health') || pkg.includes('sec.android.app.shealth') || pkg.includes('health')) {
          console.log(`[HealthMonitor] Samsung Health notification: pkg=${pkg} text="${text.substring(0, 80)}"`);

          // Steps: any number followed by steps-related words, OR within the text
          const stepsMatch = text.match(/(\d[\d,\.]+)\s*(?:צעדים|steps|צעד|걸음)/i)
            || text.match(/(?:צעדים|steps)[:\s]*(\d[\d,\.]+)/i)
            || text.match(/(\d{3,6})\s*\//);  // "3456 / 6000" style
          if (stepsMatch) {
            const num = parseInt(stepsMatch[1].replace(/[,\.]/g, ''));
            if (num > 0 && num < 200000) {
              this.samsungHealthCache.steps = num;
              console.log(`[HealthMonitor] → Steps: ${num}`);
            }
          }

          // Heart rate: various formats
          const hrMatch = text.match(/(\d{2,3})\s*(?:bpm|פעימות|דופק|BPM)/i)
            || text.match(/(?:דופק|heart|bpm|HR)[:\s]*(\d{2,3})/i)
            || text.match(/(\d{2,3})\s*(?:beats|heartbeat)/i);
          if (hrMatch) {
            const num = parseInt(hrMatch[1]);
            if (num > 30 && num < 220) {
              this.samsungHealthCache.heartRate = num;
              console.log(`[HealthMonitor] → Heart Rate: ${num}`);
            }
          }
        }
      }
      this.samsungHealthCache.ts = Date.now();
    }, undefined);
  }

  // Debug: get raw Samsung Health notification data
  debugNotifications(): { samsungNotifications: any[]; allPackages: string[] } {
    return safe(() => {
      const raw = execSync('termux-notification-list 2>/dev/null', { timeout: 8000 }).toString();
      const notifications = JSON.parse(raw);
      if (!Array.isArray(notifications)) return { samsungNotifications: [], allPackages: [] };

      const allPackages = [...new Set(notifications.map((n: any) => n.packageName || ''))];
      const samsung = notifications.filter((n: any) => {
        const pkg = (n.packageName || '') as string;
        return pkg.includes('shealth') || pkg.includes('health') || pkg.includes('samsung') || pkg.includes('wearable');
      }).map((n: any) => ({
        packageName: n.packageName,
        title: n.title,
        content: n.content,
        subText: n.subText,
        bigText: n.bigText,
      }));

      return { samsungNotifications: samsung, allPackages };
    }, { samsungNotifications: [], allPackages: [] });
  }

  // ===== UI AUTOMATOR SCRAPING (Samsung Health app) =====
  private readSamsungHealthUI(): { heartRate: number | null; steps: number | null } {
    return safe(() => {
      // Dump current UI — only useful if Samsung Health is open or was recently
      const raw = execSync(
        'uiautomator dump /dev/stdout 2>/dev/null | grep -oP "text=\"[^\"]*\""',
        { timeout: 10000 }
      ).toString();

      let hr: number | null = null;
      let steps: number | null = null;

      // Look for heart rate values
      const hrMatch = raw.match(/text="(\d{2,3})"[^]*?text="(?:bpm|פעימות|BPM)"/i);
      if (hrMatch) {
        const n = parseInt(hrMatch[1]);
        if (n > 30 && n < 220) hr = n;
      }

      // Look for step values
      const stepsMatch = raw.match(/text="([\d,\.]+)"[^]*?text="(?:צעדים|steps|Steps)"/i);
      if (stepsMatch) {
        const n = parseInt(stepsMatch[1].replace(/[,\.]/g, ''));
        if (n >= 0 && n < 200000) steps = n;
      }

      return { heartRate: hr, steps };
    }, { heartRate: null, steps: null });
  }

  // ===== HEART RATE =====
  private readHeartRate(): number | null {
    // 1. Try Samsung Health notifications first (most reliable, non-invasive)
    this.readSamsungHealthNotifications();
    if (this.samsungHealthCache.heartRate) return this.samsungHealthCache.heartRate;

    // 2. Try hardware heart rate sensor
    const hrSensor = this.availableSensors.find(s =>
      s.toLowerCase().includes('heart') || s.toLowerCase().includes('hr') || s.toLowerCase().includes('ppg')
    );

    if (hrSensor) {
      const result = safe(() => {
        const raw = execSync(`termux-sensor -s "${hrSensor}" -n 1 2>/dev/null`, { timeout: 8000 }).toString();
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          const values = Object.values(data).flat();
          for (const v of values) {
            const num = typeof v === 'number' ? v : parseFloat(String(v));
            if (!isNaN(num) && num > 30 && num < 220) return num;
          }
        }
        return null;
      }, null);
      if (result) return result;
    }

    // 3. Try Health Connect / Google Fit content provider
    return safe(() => {
      const raw = execSync(
        'content query --uri content://com.google.android.apps.fitness.sensors/sessions ' +
        '--projection start_time,heart_rate 2>/dev/null | tail -1',
        { timeout: 5000 }
      ).toString();
      const match = raw.match(/heart_rate=(\d+)/);
      return match ? parseInt(match[1]) : null;
    }, null);
  }

  // ===== STEP COUNT =====
  private readSteps(): number | null {
    // 1. Try Samsung Health notifications first
    this.readSamsungHealthNotifications();
    if (this.samsungHealthCache.steps) return this.samsungHealthCache.steps;

    // 2. Try step counter sensor (some phones have this)
    const stepSensor = this.availableSensors.find(s =>
      s.toLowerCase().includes('step') || s.toLowerCase().includes('pedometer')
    );

    if (stepSensor) {
      const result = safe(() => {
        const raw = execSync(`termux-sensor -s "${stepSensor}" -n 1 2>/dev/null`, { timeout: 8000 }).toString();
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          const values = Object.values(data).flat();
          for (const v of values) {
            const num = typeof v === 'number' ? v : parseFloat(String(v));
            if (!isNaN(num) && num >= 0) return Math.round(num);
          }
        }
        return null;
      }, null);
      if (result !== null) return result;
    }

    return null;
  }

  // ===== ACCELEROMETER (movement detection) =====
  private readAccelerometer(): { x: number; y: number; z: number } | null {
    const accelSensor = this.availableSensors.find(s =>
      s.toLowerCase().includes('accel')
    );

    if (!accelSensor) return null;

    return safe(() => {
      const raw = execSync(`termux-sensor -s "${accelSensor}" -n 1 2>/dev/null`, { timeout: 8000 }).toString();
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        const vals = Object.values(data).flat().filter((v: any) => typeof v === 'number') as number[];
        if (vals.length >= 3) return { x: vals[0], y: vals[1], z: vals[2] };
      }
      return null;
    }, null);
  }

  // ===== MOVEMENT DETECTION =====
  private isMoving(accel: { x: number; y: number; z: number } | null): boolean {
    if (!accel) return false;
    // Calculate magnitude — stationary ≈ 9.8 (gravity), movement adds variance
    const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
    // If significantly different from pure gravity, user is moving
    return Math.abs(magnitude - 9.81) > 1.5;
  }

  // ===== STRESS ESTIMATION =====
  private estimateStress(heartRate: number | null): HealthReading['stressIndicator'] {
    if (heartRate === null) return 'unknown';
    // Simplified stress indicator based on resting heart rate
    // Real implementation would use HRV (heart rate variability)
    if (heartRate < 70) return 'low';
    if (heartRate < 90) return 'medium';
    return 'high';
  }

  // ===== COLLECT READING =====
  private collect(): void {
    const heartRate = this.readHeartRate();
    const steps = this.readSteps();
    const accel = this.readAccelerometer();
    const moving = this.isMoving(accel);

    const reading: HealthReading = {
      timestamp: new Date().toISOString(),
      heartRate,
      steps,
      accelerometer: accel,
      isMoving: moving,
      stressIndicator: this.estimateStress(heartRate),
    };

    this.readings.push(reading);
    this.readings = this.readings.slice(-MAX_RECORDS);
    this.saveReadings();

    const parts = [];
    if (heartRate !== null) parts.push(`HR:${heartRate}`);
    if (steps !== null) parts.push(`Steps:${steps}`);
    parts.push(moving ? 'Moving' : 'Still');
    console.log(`[HealthMonitor] ${parts.join(', ')}`);
  }

  // ===== STATUS =====
  getHealthStatus(): HealthStatus {
    const recent = this.readings.slice(-12); // Last hour
    const latest = recent.length > 0 ? recent[recent.length - 1] : null;

    // Average heart rate from available readings
    const hrReadings = recent.filter(r => r.heartRate !== null).map(r => r.heartRate!);
    const avgHr = hrReadings.length > 0 ? Math.round(hrReadings.reduce((a, b) => a + b, 0) / hrReadings.length) : null;

    // Is heart rate abnormal? (> 100 resting or sudden spike > 30% over average)
    const currentHr = latest?.heartRate || null;
    let isAbnormal = false;
    if (currentHr !== null && avgHr !== null) {
      isAbnormal = currentHr > 100 || currentHr > avgHr * 1.3;
    }

    // Sedentary minutes (consecutive not-moving readings × 5 min)
    let sedentaryMinutes = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      if (recent[i].isMoving) break;
      sedentaryMinutes += 5;
    }

    // Stress level from latest or average
    const stressReadings = recent.filter(r => r.stressIndicator !== 'unknown');
    let stressLevel: HealthStatus['stressLevel'] = 'unknown';
    if (stressReadings.length > 0) {
      const stressMap = { low: 0, medium: 1, high: 2, unknown: 1 };
      const avg = stressReadings.reduce((sum, r) => sum + stressMap[r.stressIndicator], 0) / stressReadings.length;
      stressLevel = avg < 0.5 ? 'low' : avg < 1.5 ? 'medium' : 'high';
    }

    return {
      currentHeartRate: currentHr,
      avgHeartRate: avgHr,
      isHeartRateAbnormal: isAbnormal,
      todaySteps: latest?.steps || null,
      isMoving: latest?.isMoving || false,
      sedentaryMinutes,
      stressLevel,
      lastReading: latest?.timestamp || null,
    };
  }

  getReadings(): HealthReading[] {
    return this.readings;
  }

  getAvailableSensors(): string[] {
    return this.availableSensors;
  }
}
