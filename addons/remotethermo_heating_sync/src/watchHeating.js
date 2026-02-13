import fs from 'node:fs';
import path from 'node:path';
import {
  HEATING_ALLOWED_KEYS,
  OUTPUT_DIR,
  WATCH_ERROR_BACKOFF_MS,
  WATCH_INTERVAL_MS,
  ensureDir
} from './heatingConfig.js';
import { scrapeHeating } from './scrapeHeatingDashboard.js';
import { publishHeatingToHomeAssistant } from './publishHeatingToHomeAssistant.js';

const LAST_STATE_FILE = path.join(OUTPUT_DIR, 'heating-last-published-state.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function metricValue(metric) {
  return typeof metric.numberValue === 'number' ? metric.numberValue : metric.value;
}

function snapshotFromPayload(payload) {
  const snapshot = {};
  for (const metric of payload.metrics || []) {
    snapshot[metric.key] = metricValue(metric);
  }
  return snapshot;
}

function loadLastSnapshot() {
  try {
    if (!fs.existsSync(LAST_STATE_FILE)) return null;
    const raw = fs.readFileSync(LAST_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.values && typeof parsed.values === 'object' ? parsed.values : null;
  } catch {
    return null;
  }
}

function saveSnapshot(values) {
  ensureDir(OUTPUT_DIR);
  const payload = {
    updatedAt: new Date().toISOString(),
    values
  };
  fs.writeFileSync(LAST_STATE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

function getChangedKeys(current, previous) {
  if (!previous) return Object.keys(current);

  const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
  const changed = [];

  for (const key of keys) {
    if (!(key in current)) continue;
    if (current[key] !== previous[key]) changed.push(key);
  }

  return changed;
}

async function runOnce(previousSnapshot) {
  const { payload, filePath } = await scrapeHeating();
  const currentSnapshot = snapshotFromPayload(payload);
  const changedKeys = getChangedKeys(currentSnapshot, previousSnapshot);
  const publishKeys = HEATING_ALLOWED_KEYS.length
    ? changedKeys.filter((key) => HEATING_ALLOWED_KEYS.includes(key))
    : changedKeys;

  if (publishKeys.length === 0) {
    console.log(
      `[${new Date().toISOString()}] No metric changes (${Object.keys(currentSnapshot).length} tracked).`
    );
    return currentSnapshot;
  }

  const publishResult = await publishHeatingToHomeAssistant(payload, { onlyKeys: publishKeys });

  console.log(
    `[${new Date().toISOString()}] Captured ${payload.metricCount} metrics (${filePath}), published ${publishResult.metricCount} changed metrics.`
  );

  return currentSnapshot;
}

async function main() {
  console.log(
    `[${new Date().toISOString()}] Heating watch started. Interval ${WATCH_INTERVAL_MS}ms, error backoff ${WATCH_ERROR_BACKOFF_MS}ms.`
  );

  let snapshot = loadLastSnapshot();

  while (true) {
    try {
      snapshot = await runOnce(snapshot);
      saveSnapshot(snapshot);
      await sleep(WATCH_INTERVAL_MS);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Watch iteration failed:`, error);
      await sleep(WATCH_ERROR_BACKOFF_MS);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
