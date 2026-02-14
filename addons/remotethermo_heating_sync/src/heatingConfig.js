import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const ROOT_DIR = process.cwd();
export const DATA_DIR = process.env.HEATING_DATA_DIR || ROOT_DIR;
export const AUTH_DIR = path.join(DATA_DIR, 'playwright', '.auth');
export const OUTPUT_DIR = path.join(DATA_DIR, 'output');

export const HEATING_DASHBOARD_URL =
  process.env.HEATING_DASHBOARD_URL ||
  'https://www.remocon-net.remotethermo.com/BsbPlantDashboard/Index/';

export const HEATING_LOGIN_URL =
  process.env.HEATING_LOGIN_URL || 'https://www.remocon-net.remotethermo.com/R2/Account/Login';

export const HEATING_STORAGE_STATE_PATH =
  process.env.HEATING_STORAGE_STATE_PATH || path.join(AUTH_DIR, 'remotethermo.json');

export const HEATING_BROWSER_EXECUTABLE_PATH = process.env.HEATING_BROWSER_EXECUTABLE_PATH || '';

export const SCRAPE_MAX_WAIT_MS = Number.parseInt(process.env.SCRAPE_MAX_WAIT_MS || '90000', 10);
export const SCRAPE_STABLE_PASSES = Number.parseInt(process.env.SCRAPE_STABLE_PASSES || '4', 10);
export const SCRAPE_POLL_DELAY_MS = Number.parseInt(process.env.SCRAPE_POLL_DELAY_MS || '2000', 10);

export const HEATING_INCLUDE_REGEX = process.env.HEATING_INCLUDE_REGEX || '';
export const HEATING_EXCLUDE_REGEX = process.env.HEATING_EXCLUDE_REGEX || '';

export const MQTT_URL = process.env.MQTT_URL || '';
export const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
export const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
export const MQTT_DISCOVERY_PREFIX = process.env.MQTT_DISCOVERY_PREFIX || 'homeassistant';
export const MQTT_STATE_TOPIC = process.env.MQTT_STATE_TOPIC || 'elco_remocon/heating/state';
export const WATCH_INTERVAL_MS = Number.parseInt(process.env.WATCH_INTERVAL_MS || '300000', 10);
export const WATCH_ERROR_BACKOFF_MS = Number.parseInt(
  process.env.WATCH_ERROR_BACKOFF_MS || '60000',
  10
);

export const HA_DEVICE_NAME = process.env.HA_DEVICE_NAME || 'ELCO Remocon.net Heating';
export const HA_DEVICE_ID = process.env.HA_DEVICE_ID || 'elco_remocon_heating';

export const HEATING_LOGIN_USERNAME = process.env.HEATING_LOGIN_USERNAME || '';
export const HEATING_LOGIN_PASSWORD = process.env.HEATING_LOGIN_PASSWORD || '';
export const HEATING_ALLOWED_KEYS = String(process.env.HEATING_ALLOWED_KEYS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
