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

  // ===== HEART RATE =====
  private readHeartRate(): number | null {
    // Try heart rate sensor directly
    const hrSensor = this.availableSensors.find(s =>
      s.toLowerCase().includes('heart') || s.toLowerCase().includes('hr') || s.toLowerCase().includes('ppg')
    );

    if (hrSensor) {
      return safe(() => {
        const raw = execSync(`termux-sensor -s "${hrSensor}" -n 1 2>/dev/null`, { timeout: 8000 }).toString();
        const data = JSON.parse(raw);
        // Extract numeric value from sensor reading
        if (data && typeof data === 'object') {
          const values = Object.values(data).flat();
          for (const v of values) {
            const num = typeof v === 'number' ? v : parseFloat(String(v));
            if (!isNaN(num) && num > 30 && num < 220) return num; // Valid HR range
          }
        }
        return null;
      }, null);
    }

    // Try Health Connect / Google Fit via content provider
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
    // Try step counter sensor
    const stepSensor = this.availableSensors.find(s =>
      s.toLowerCase().includes('step') || s.toLowerCase().includes('pedometer')
    );

    if (stepSensor) {
      return safe(() => {
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
