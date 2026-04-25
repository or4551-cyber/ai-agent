import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '.', '.ai-agent');
const SCAN_FILE = path.join(DATA_DIR, 'device-scans.json');
const SCAN_INTERVAL = 5 * 60 * 1000; // Every 5 minutes
const MAX_SCANS = 288; // 24 hours of scans at 5-min intervals

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export interface DeviceScan {
  timestamp: string;
  wifi: WifiDevice[];
  bluetooth: BluetoothDevice[];
  nearbyCount: number;
}

export interface WifiDevice {
  bssid: string;
  ssid: string;
  rssi: number;
  frequency: number;
}

export interface BluetoothDevice {
  address: string;
  name: string;
  rssi: number;
}

export interface ProximityStatus {
  isAlone: boolean;
  nearbyDeviceCount: number;
  aloneMinutes: number;
  lastSeen: string | null;
  trend: 'alone_longer' | 'company_arrived' | 'stable';
}

export class DeviceScanner {
  private timer: NodeJS.Timeout | null = null;
  private scans: DeviceScan[] = [];
  private running = false;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    this.loadScans();
  }

  private loadScans(): void {
    try {
      if (fs.existsSync(SCAN_FILE)) {
        this.scans = JSON.parse(fs.readFileSync(SCAN_FILE, 'utf-8'));
      }
    } catch { this.scans = []; }
  }

  private saveScans(): void {
    try {
      fs.writeFileSync(SCAN_FILE, JSON.stringify(this.scans.slice(-MAX_SCANS)), 'utf-8');
    } catch {}
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[DeviceScanner] Starting (scan every 5 min)');
    
    // First scan
    this.scan();
    
    // Periodic scans
    this.timer = setInterval(() => this.scan(), SCAN_INTERVAL);
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  // ===== WIFI SCAN =====
  private scanWifi(): WifiDevice[] {
    return safe(() => {
      const raw = execSync('termux-wifi-scaninfo 2>/dev/null', { timeout: 10000 }).toString();
      const devices = JSON.parse(raw);
      if (!Array.isArray(devices)) return [];
      return devices.map((d: any) => ({
        bssid: d.bssid || '',
        ssid: d.ssid || '',
        rssi: d.level || d.rssi || -100,
        frequency: d.frequency || 0,
      })).filter((d: WifiDevice) => d.bssid);
    }, []);
  }

  // ===== BLUETOOTH SCAN =====
  private scanBluetooth(): BluetoothDevice[] {
    return safe(() => {
      const raw = execSync('termux-bluetooth-scan -t 5 2>/dev/null', { timeout: 15000 }).toString();
      const devices = JSON.parse(raw);
      if (!Array.isArray(devices)) return [];
      return devices.map((d: any) => ({
        address: d.address || d.mac || '',
        name: d.name || 'Unknown',
        rssi: d.rssi || -100,
      })).filter((d: BluetoothDevice) => d.address);
    }, []);
  }

  // ===== FULL SCAN =====
  private scan(): void {
    const wifi = this.scanWifi();
    const bluetooth = this.scanBluetooth();
    
    // Filter out access points / infrastructure — focus on personal devices
    // Personal devices usually have rssi > -70 (close proximity)
    const nearbyWifi = wifi.filter(d => d.rssi > -70);
    const nearbyBt = bluetooth.filter(d => d.rssi > -80);
    
    const scan: DeviceScan = {
      timestamp: new Date().toISOString(),
      wifi: nearbyWifi,
      bluetooth: nearbyBt,
      nearbyCount: nearbyBt.length + Math.min(nearbyWifi.length, 5), // BT is more reliable for people
    };

    this.scans.push(scan);
    this.scans = this.scans.slice(-MAX_SCANS);
    this.saveScans();

    console.log(`[DeviceScanner] Scan: ${nearbyBt.length} BT, ${nearbyWifi.length} WiFi nearby`);
  }

  // ===== PROXIMITY STATUS =====
  getProximityStatus(): ProximityStatus {
    if (this.scans.length === 0) {
      return { isAlone: false, nearbyDeviceCount: -1, aloneMinutes: 0, lastSeen: null, trend: 'stable' };
    }

    const latest = this.scans[this.scans.length - 1];
    const isAlone = latest.nearbyCount === 0;

    // Calculate how long alone
    let aloneMinutes = 0;
    if (isAlone) {
      for (let i = this.scans.length - 1; i >= 0; i--) {
        if (this.scans[i].nearbyCount > 0) break;
        aloneMinutes += 5;
      }
    }

    // Find last time someone was nearby
    let lastSeen: string | null = null;
    for (let i = this.scans.length - 1; i >= 0; i--) {
      if (this.scans[i].nearbyCount > 0) {
        lastSeen = this.scans[i].timestamp;
        break;
      }
    }

    // Trend detection
    let trend: ProximityStatus['trend'] = 'stable';
    if (this.scans.length >= 3) {
      const prev = this.scans[this.scans.length - 2];
      if (latest.nearbyCount === 0 && prev.nearbyCount > 0) trend = 'alone_longer';
      if (latest.nearbyCount > 0 && prev.nearbyCount === 0) trend = 'company_arrived';
    }

    return {
      isAlone,
      nearbyDeviceCount: latest.nearbyCount,
      aloneMinutes,
      lastSeen,
      trend,
    };
  }

  // ===== STATS =====
  getScans(): DeviceScan[] {
    return this.scans;
  }

  getScanCount(): number {
    return this.scans.length;
  }

  getLatestScan(): DeviceScan | null {
    return this.scans.length > 0 ? this.scans[this.scans.length - 1] : null;
  }
}
