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

function loadLastState() {
  try {
    if (!fs.existsSync(LAST_STATE_FILE)) return { values: null, lastChangeAt: null };
    const raw = fs.readFileSync(LAST_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      values: parsed?.values && typeof parsed.values === 'object' ? parsed.values : null,
      lastChangeAt: typeof parsed?.lastChangeAt === 'string' ? parsed.lastChangeAt : null
    };
  } catch {
    return { values: null, lastChangeAt: null };
  }
}

function saveState(values, lastChangeAt) {
  ensureDir(OUTPUT_DIR);
  const payload = {
    updatedAt: new Date().toISOString(),
    lastChangeAt: lastChangeAt || null,
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

function buildSyncMetrics({ nowIso, lastChangeAt, trackedCount, changedCount, filePath }) {
  const summary = `Captured ${trackedCount} metrics, published ${changedCount} changed metrics.`;

  const metrics = [
    {
      key: 'sync_last_run_at',
      label: 'Sync Last Run At',
      value: nowIso,
      numberValue: null,
      unit: null
    },
    {
      key: 'sync_tracked_metrics_count',
      label: 'Sync Tracked Metrics Count',
      value: trackedCount,
      numberValue: trackedCount,
      unit: null
    },
    {
      key: 'sync_published_changed_metrics_count',
      label: 'Sync Published Changed Metrics Count',
      value: changedCount,
      numberValue: changedCount,
      unit: null
    },
    {
      key: 'sync_last_summary',
      label: 'Sync Last Summary',
      value: summary,
      numberValue: null,
      unit: null
    }
  ];

  if (lastChangeAt) {
    metrics.push({
      key: 'sync_last_change_at',
      label: 'Sync Last Change At',
      value: lastChangeAt,
      numberValue: null,
      unit: null
    });
  }

  if (filePath) {
    metrics.push({
      key: 'sync_last_output_file',
      label: 'Sync Last Output File',
      value: filePath,
      numberValue: null,
      unit: null
    });
  }

  return metrics;
}

async function publishSyncStatus({ nowIso, lastChangeAt, trackedCount, changedCount, filePath }) {
  const metrics = buildSyncMetrics({ nowIso, lastChangeAt, trackedCount, changedCount, filePath });
  await publishHeatingToHomeAssistant(
    {
      capturedAt: nowIso,
      url: 'watchHeating',
      metrics,
      metricCount: metrics.length
    },
    { publishDiscovery: true }
  );
}

async function runOnce(previousSnapshot, previousLastChangeAt) {
  const { payload, filePath } = await scrapeHeating();
  const currentSnapshot = snapshotFromPayload(payload);
  const changedKeys = getChangedKeys(currentSnapshot, previousSnapshot);
  const publishKeys = HEATING_ALLOWED_KEYS.length
    ? changedKeys.filter((key) => HEATING_ALLOWED_KEYS.includes(key))
    : changedKeys;

  const nowIso = new Date().toISOString();
  const changedCount = publishKeys.length;
  const trackedCount = Object.keys(currentSnapshot).length;
  const lastChangeAt = changedCount > 0 ? nowIso : previousLastChangeAt;

  if (publishKeys.length > 0) {
    const publishResult = await publishHeatingToHomeAssistant(payload, { onlyKeys: publishKeys });
    console.log(
      `[${nowIso}] Captured ${payload.metricCount} metrics (${filePath}), published ${publishResult.metricCount} changed metrics.`
    );
  } else {
    console.log(`[${nowIso}] No metric changes (${trackedCount} tracked).`);
  }

  await publishSyncStatus({ nowIso, lastChangeAt, trackedCount, changedCount, filePath });

  return { snapshot: currentSnapshot, lastChangeAt };
}

async function main() {
  console.log(
    `[${new Date().toISOString()}] Heating watch started. Interval ${WATCH_INTERVAL_MS}ms, error backoff ${WATCH_ERROR_BACKOFF_MS}ms.`
  );

  const state = loadLastState();
  let snapshot = state.values;
  let lastChangeAt = state.lastChangeAt;

  while (true) {
    try {
      const result = await runOnce(snapshot, lastChangeAt);
      snapshot = result.snapshot;
      lastChangeAt = result.lastChangeAt;
      saveState(snapshot, lastChangeAt);
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
