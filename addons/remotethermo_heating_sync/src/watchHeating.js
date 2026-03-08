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
const MAX_CONSECUTIVE_FAILURES = Number.parseInt(
  process.env.WATCH_MAX_CONSECUTIVE_FAILURES || '15',
  10
);
const MIN_ACCEPTED_METRICS = 19;
const INCOMPLETE_RETRY_DELAY_MS = Number.parseInt(
  process.env.WATCH_INCOMPLETE_RETRY_DELAY_MS || '7000',
  10
);

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

function isSystemKey(key) {
  return key.startsWith('sync_');
}

function stripSystemKeys(snapshot) {
  if (!snapshot) return null;
  const out = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (isSystemKey(key)) continue;
    out[key] = value;
  }
  return out;
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

function buildSystemMetrics(capturedAt, changedMetricCount) {
  return [
    {
      key: 'sync_last_success_at',
      label: 'Last Successful Sync',
      value: capturedAt,
      numberValue: null,
      unit: null
    },
    {
      key: 'sync_changed_metric_count',
      label: 'Changed Metrics (Last Sync)',
      value: String(changedMetricCount),
      numberValue: changedMetricCount,
      unit: null
    }
  ];
}

async function scrapeWithIncompleteRetry() {
  const first = await scrapeHeating();
  if (first.payload.metricCount >= MIN_ACCEPTED_METRICS) return first;

  const firstKeys = (first.payload.metrics || []).map((m) => m.key).join(', ');
  console.warn(
    `[${new Date().toISOString()}] Incomplete scrape (${first.payload.metricCount} metrics). Keys: ${firstKeys || 'none'}. Retrying once in ${INCOMPLETE_RETRY_DELAY_MS}ms.`
  );

  await sleep(INCOMPLETE_RETRY_DELAY_MS);

  const second = await scrapeHeating();
  if (second.payload.metricCount >= MIN_ACCEPTED_METRICS) return second;

  const secondKeys = (second.payload.metrics || []).map((m) => m.key).join(', ');
  throw new Error(
    `Incomplete scrape persisted (${first.payload.metricCount} -> ${second.payload.metricCount} metrics, minimum ${MIN_ACCEPTED_METRICS}). Latest keys: ${secondKeys || 'none'}. Keeping previous state and retrying.`
  );
}

async function runOnce(previousSnapshot) {
  const { payload, filePath } = await scrapeWithIncompleteRetry();

  const previousDomainSnapshot = stripSystemKeys(previousSnapshot);
  const domainSnapshot = snapshotFromPayload(payload);
  const domainChangedKeys = getChangedKeys(domainSnapshot, previousDomainSnapshot);

  const systemMetrics = buildSystemMetrics(payload.capturedAt, domainChangedKeys.length);
  const mergedPayload = {
    ...payload,
    metrics: [...payload.metrics, ...systemMetrics],
    metricCount: payload.metrics.length + systemMetrics.length
  };

  const currentSnapshot = snapshotFromPayload(mergedPayload);
  const changedKeys = getChangedKeys(currentSnapshot, previousSnapshot);
  const publishKeys = HEATING_ALLOWED_KEYS.length
    ? changedKeys.filter((key) => HEATING_ALLOWED_KEYS.includes(key) || isSystemKey(key))
    : changedKeys;

  if (publishKeys.length === 0) {
    console.log(
      `[${new Date().toISOString()}] No metric changes (${Object.keys(currentSnapshot).length} tracked).`
    );
    return currentSnapshot;
  }

  const publishResult = await publishHeatingToHomeAssistant(mergedPayload, { onlyKeys: publishKeys });

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
  let consecutiveFailures = 0;

  while (true) {
    try {
      snapshot = await runOnce(snapshot);
      saveSnapshot(snapshot);
      consecutiveFailures = 0;
      await sleep(WATCH_INTERVAL_MS);
    } catch (error) {
      consecutiveFailures += 1;
      console.error(
        `[${new Date().toISOString()}] Watch iteration failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`,
        error
      );

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(
          `[${new Date().toISOString()}] Too many consecutive failures; exiting so Home Assistant can restart the app cleanly.`
        );
        process.exit(1);
      }

      await sleep(WATCH_ERROR_BACKOFF_MS);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
