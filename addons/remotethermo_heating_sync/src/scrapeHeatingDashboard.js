import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  AUTH_DIR,
  HEATING_BROWSER_EXECUTABLE_PATH,
  HEATING_DASHBOARD_URL,
  HEATING_STORAGE_STATE_PATH,
  OUTPUT_DIR,
  SCRAPE_MAX_WAIT_MS,
  SCRAPE_POLL_DELAY_MS,
  SCRAPE_STABLE_PASSES,
  ensureDir,
  todayStamp
} from './heatingConfig.js';
import { setupHeatingLoginWithCredentials } from './setupHeatingLoginWithCredentials.js';

const DEBUG_RAW = process.env.HEATING_DEBUG_RAW === '1';

function clean(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  const normalized = String(value || '')
    .replace(',', '.')
    .match(/-?\d+(?:\.\d+)?/);
  if (!normalized) return null;
  const n = Number.parseFloat(normalized[0]);
  return Number.isFinite(n) ? n : null;
}

function boolFromText(value) {
  const v = clean(value).toLowerCase();
  if (!v) return null;
  if (/\bon\b|\bok\b|\bactive\b|\btrue\b/.test(v)) return true;
  if (/\boff\b|\binactive\b|\bfalse\b/.test(v)) return false;
  return null;
}

function regexCapture(text, re, group = 1) {
  const match = String(text || '').match(re);
  return match?.[group] ? clean(match[group]) : null;
}

function findRawValue(rawMetrics, labelRegex) {
  const item = rawMetrics.find((m) => labelRegex.test(m.label));
  return item ? clean(item.value) : null;
}

function findRawLabel(rawMetrics, labelRegex) {
  const item = rawMetrics.find((m) => labelRegex.test(m.label));
  return item ? clean(item.label) : null;
}

function findTempCandidate(rawMetrics, labelRegex, minValue) {
  const candidates = rawMetrics
    .filter((m) => labelRegex.test(m.label))
    .map((m) => ({ n: toNumber(m.value), text: clean(m.value) }))
    .filter((x) => x.n !== null && x.n >= minValue)
    .sort((a, b) => b.n - a.n);

  return candidates[0]?.text || null;
}

function normalizeOperationMode(value) {
  const v = clean(value).toLowerCase();
  if (!v) return null;

  const allowed = new Map([
    ['on', 'On'],
    ['off', 'Off'],
    ['auto', 'Auto'],
    ['automatic', 'Auto'],
    ['holiday', 'Holiday'],
    ['reduced', 'Reduced'],
    ['comfort', 'Comfort']
  ]);

  return allowed.get(v) || null;
}

function extractHotWaterBlock(textBlob) {
  const compact = clean(textBlob);
  const lower = compact.toLowerCase();
  const idx = lower.indexOf('hot water');
  if (idx === -1) return compact;
  return compact.slice(idx, idx + 3200);
}

function canonicalMetrics(rawMetrics, textBlob) {
  const compactText = clean(textBlob);
  const hotWaterText = extractHotWaterBlock(compactText);

  const gatewaySerial =
    findRawValue(rawMetrics, /^gateway\s*serial/i) ||
    regexCapture(compactText, /Gateway\s*Serial\s*([A-Za-z0-9-]+)/i);

  const outsideTemperatureText =
    findRawValue(rawMetrics, /^weather$/i) ||
    regexCapture(compactText, /Weather\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*C/i);
  const outsideTemperature = toNumber(outsideTemperatureText);

  const status =
    regexCapture(compactText, /Status:\s*([A-Za-z]+)/i) ||
    findRawValue(rawMetrics, /^status:/i) ||
    findRawValue(rawMetrics, /status/i);

  const location =
    findRawLabel(rawMetrics, /^Rvs\b/i) ||
    regexCapture(compactText, /(Rvs\s+\d+[^,]*,\s*\d+\s*-\s*\d{5}\s+[A-Za-z\-]+)/i);

  const operationMode =
    normalizeOperationMode(findRawValue(rawMetrics, /^operation\s*mode$/i)) ||
    normalizeOperationMode(regexCapture(hotWaterText, /Operation\s*mode\s*([A-Za-z]+)/i));

  const hwCurrentText =
    regexCapture(hotWaterText, /Current\s*temperature\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*C/i) ||
    findTempCandidate(rawMetrics, /^current\s*temperature$/i, 25);

  const hwComfortText =
    regexCapture(hotWaterText, /Comfort\s*temperature\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*C/i) ||
    findTempCandidate(rawMetrics, /^comfort\s*temperature$/i, 25);

  const hwReducedText =
    regexCapture(hotWaterText, /Reduced\s*temperature\s*(-?\d+(?:[.,]\d+)?)\s*°?\s*C/i) ||
    findTempCandidate(rawMetrics, /^reduced\s*temperature$/i, 20);

  const heatingActive =
    boolFromText(regexCapture(compactText, /Auto\s*mode\s*(on|off)/i)) ??
    boolFromText(regexCapture(compactText, /Heating\s*(on|off)/i)) ??
    boolFromText(operationMode);

  const metrics = [];

  if (typeof heatingActive === 'boolean') {
    metrics.push({ key: 'heating_active', label: 'Heating Active', value: heatingActive, numberValue: null, unit: null });
  }

  if (gatewaySerial) {
    metrics.push({ key: 'gateway_serial', label: 'Gateway Serial', value: gatewaySerial, numberValue: null, unit: null });
  }

  if (status) {
    metrics.push({ key: 'status', label: 'Status', value: status, numberValue: null, unit: null });
  }

  if (location) {
    metrics.push({ key: 'location', label: 'Location', value: location, numberValue: null, unit: null });
  }

  if (outsideTemperature !== null) {
    metrics.push({
      key: 'outside_temperature',
      label: 'Outside Temperature',
      value: `${outsideTemperature} °C`,
      numberValue: outsideTemperature,
      unit: '°C'
    });
  }

  const hwCurrent = toNumber(hwCurrentText);
  if (hwCurrent !== null && hwCurrent >= 20) {
    metrics.push({
      key: 'hot_water_current_temperature',
      label: 'Hot Water Current Temperature',
      value: `${hwCurrent} °C`,
      numberValue: hwCurrent,
      unit: '°C'
    });
  }

  const hwComfort = toNumber(hwComfortText);
  if (hwComfort !== null && hwComfort >= 20) {
    metrics.push({
      key: 'hot_water_comfort_temperature',
      label: 'Hot Water Comfort Temperature',
      value: `${hwComfort} °C`,
      numberValue: hwComfort,
      unit: '°C'
    });
  }

  const hwReduced = toNumber(hwReducedText);
  if (hwReduced !== null && hwReduced >= 10) {
    metrics.push({
      key: 'hot_water_reduced_temperature',
      label: 'Hot Water Reduced Temperature',
      value: `${hwReduced} °C`,
      numberValue: hwReduced,
      unit: '°C'
    });
  }

  if (operationMode) {
    metrics.push({
      key: 'hot_water_operation_mode',
      label: 'Hot Water Operation Mode',
      value: operationMode,
      numberValue: null,
      unit: null
    });
  }

  return metrics;
}

function getMetric(metrics, key) {
  return metrics.find((m) => m.key === key);
}

function hotWaterLooksValid(metrics) {
  const current = getMetric(metrics, 'hot_water_current_temperature')?.numberValue;
  const comfort = getMetric(metrics, 'hot_water_comfort_temperature')?.numberValue;
  const reduced = getMetric(metrics, 'hot_water_reduced_temperature')?.numberValue;
  const mode = getMetric(metrics, 'hot_water_operation_mode')?.value;

  return (
    typeof current === 'number' &&
    current > 0 &&
    typeof comfort === 'number' &&
    comfort > 0 &&
    typeof reduced === 'number' &&
    reduced > 0 &&
    typeof mode === 'string' &&
    ['On', 'Off', 'Auto', 'Holiday', 'Reduced', 'Comfort'].includes(mode)
  );
}

function upsertMetric(metrics, metric) {
  const idx = metrics.findIndex((m) => m.key === metric.key);
  if (idx >= 0) metrics[idx] = metric;
  else metrics.push(metric);
}

function gatewayIdFromUrl(url) {
  const m = String(url || '').match(/\/Index\/([A-Za-z0-9]+)/i);
  return m?.[1] || null;
}

async function fetchPlantHomeBsbData(context, gatewayId) {
  if (!gatewayId) return null;
  const endpoint = `https://www.remocon-net.remotethermo.com/R2/PlantHomeBsb/GetData/${gatewayId}`;
  const body = {
    useCache: true,
    zone: 1,
    filter: { progIds: null, plant: true, zone: true }
  };

  try {
    const response = await context.request.post(endpoint, {
      headers: {
        'ajax-request': 'json',
        'x-requested-with': 'XMLHttpRequest',
        'content-type': 'application/json; charset=UTF-8'
      },
      data: body
    });
    if (!response.ok()) return null;
    const json = await response.json();
    return json?.data?.plantData || null;
  } catch {
    return null;
  }
}

async function refreshAuthStateFromChromeCdp() {
  const endpoint = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
  const cdpBrowser = await chromium.connectOverCDP(endpoint);
  try {
    const contexts = cdpBrowser.contexts();
    if (!contexts.length) {
      throw new Error('No Chrome contexts found on CDP endpoint.');
    }

    const context = contexts[0];
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(HEATING_DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    ensureDir(AUTH_DIR);
    const state = await context.storageState();
    fs.writeFileSync(HEATING_STORAGE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  } finally {
    await cdpBrowser.close();
  }
}

function hasLoginCredentials() {
  return Boolean(process.env.HEATING_LOGIN_USERNAME && process.env.HEATING_LOGIN_PASSWORD);
}

function canUseChromeCdpRefresh() {
  return process.env.HEATING_DISABLE_CDP_REFRESH !== '1';
}

function launchOptions(headless) {
  const options = {
    headless,
    ignoreDefaultArgs: ['--enable-automation']
  };
  if (HEATING_BROWSER_EXECUTABLE_PATH) {
    options.executablePath = HEATING_BROWSER_EXECUTABLE_PATH;
  }
  return options;
}

function loadLastGoodHotWater() {
  try {
    const p = path.join(OUTPUT_DIR, 'heating-hot-water-last-good.json');
    if (!fs.existsSync(p)) return null;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(parsed?.metrics) ? parsed.metrics : null;
  } catch {
    return null;
  }
}

function saveLastGoodHotWater(metrics) {
  const hot = metrics.filter((m) => m.key.startsWith('hot_water_'));
  if (!hot.length) return;
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'heating-hot-water-last-good.json'),
    `${JSON.stringify({ updatedAt: new Date().toISOString(), metrics: hot }, null, 2)}\n`
  );
}

function buildSelectedMetrics(snapshot, vmHotWater) {
  const rawMetrics = [];
  for (const pair of snapshot.values) {
    const label = clean(pair.label);
    const value = clean(pair.value);
    if (!label || !value) continue;
    rawMetrics.push({ label, value });
  }

  if (vmHotWater?.current) {
    rawMetrics.push({ label: 'Current temperature', value: vmHotWater.current });
  }
  if (vmHotWater?.comfort) {
    rawMetrics.push({ label: 'Comfort temperature', value: vmHotWater.comfort });
  }
  if (vmHotWater?.reduced) {
    rawMetrics.push({ label: 'Reduced temperature', value: vmHotWater.reduced });
  }
  if (vmHotWater?.mode) {
    rawMetrics.push({ label: 'Operation mode', value: vmHotWater.mode });
  }

  return { rawMetrics, selected: canonicalMetrics(rawMetrics, snapshot.textBlob) };
}

async function collectPairsFromFrame(frame) {
  return frame.evaluate(() => {
    const cleanText = (text) =>
      String(text || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const looksNumericish = (value) => /\d/.test(value) || /\u00b0|%|bar|kw|kwh|on|off|ok/i.test(value);
    const pairs = [];

    const pushPair = (label, value, source) => {
      const l = cleanText(label);
      const v = cleanText(value);
      if (!l || !v) return;
      if (l.length < 2 || v.length < 1) return;
      if (l.length > 140 || v.length > 220) return;
      if (!looksNumericish(v) && v.length > 60) return;
      pairs.push({ label: l, value: v, source });
    };

    for (const table of document.querySelectorAll('table')) {
      for (const row of table.querySelectorAll('tr')) {
        const cells = Array.from(row.querySelectorAll('th,td')).map((el) => cleanText(el.textContent));
        if (cells.length >= 2) pushPair(cells[0], cells.slice(1).join(' | '), 'table');
      }
    }

    for (const dl of document.querySelectorAll('dl')) {
      const dts = Array.from(dl.querySelectorAll('dt'));
      const dds = Array.from(dl.querySelectorAll('dd'));
      const len = Math.min(dts.length, dds.length);
      for (let i = 0; i < len; i += 1) {
        pushPair(dts[i].textContent, dds[i].textContent, 'definition_list');
      }
    }

    for (const block of document.querySelectorAll('li,div,section,article')) {
      const labelEl = block.querySelector(
        'label,.label,.name,.title,.caption,.desc,.description,[data-label],[class*="name" i],[class*="label" i]'
      );
      const valueEl = block.querySelector(
        '.value,.reading,.status,.number,.val,[data-value],[class*="value" i],[class*="reading" i],[class*="temp" i]'
      );
      if (labelEl && valueEl) {
        pushPair(
          labelEl.textContent || labelEl.getAttribute('data-label'),
          valueEl.textContent || valueEl.getAttribute('data-value'),
          'label_value_block'
        );
      }

      const spans = Array.from(block.querySelectorAll(':scope > span, :scope > div'))
        .map((el) => cleanText(el.textContent))
        .filter(Boolean);
      if (spans.length === 2) {
        pushPair(spans[0], spans[1], 'two_children_block');
      }
    }

    const targetedLabels = [
      'Current temperature',
      'Comfort temperature',
      'Reduced temperature',
      'Operation mode'
    ];

    for (const targetLabel of targetedLabels) {
      const targetLower = targetLabel.toLowerCase();
      const labelNodes = Array.from(document.querySelectorAll('label,span,div,td,th')).filter(
        (el) => cleanText(el.textContent).toLowerCase() === targetLower
      );

      for (const labelNode of labelNodes) {
        const row = labelNode.closest('tr,li,section,article,div') || labelNode.parentElement || labelNode;
        if (!row) continue;

        const selectedOption = row.querySelector('select option:checked');
        if (selectedOption) {
          pushPair(targetLabel, selectedOption.textContent, 'targeted_hot_water');
          continue;
        }

        const select = row.querySelector('select');
        if (select) {
          const selectedText =
            select.options && select.selectedIndex >= 0
              ? select.options[select.selectedIndex]?.textContent
              : select.value;
          if (selectedText) {
            pushPair(targetLabel, selectedText, 'targeted_hot_water');
            continue;
          }
        }

        const input = row.querySelector('input,textarea');
        if (input) {
          const aria = input.getAttribute('aria-valuenow');
          const val = input.value || input.getAttribute('value') || aria;
          if (val) {
            pushPair(targetLabel, val, 'targeted_hot_water');
            continue;
          }
        }

        const ariaNode = row.querySelector('[aria-valuenow]');
        if (ariaNode) {
          const val = ariaNode.getAttribute('aria-valuenow');
          if (val) {
            pushPair(targetLabel, val, 'targeted_hot_water');
            continue;
          }
        }

        const rowText = cleanText(row.textContent || '');
        if (targetLabel === 'Operation mode') {
          const op = rowText.match(/Operation\s*mode\s*([A-Za-z]+)/i);
          if (op?.[1]) pushPair(targetLabel, op[1], 'targeted_hot_water');
        } else {
          const m = rowText.match(/(-?\d+(?:[.,]\d+)?)\s*°?\s*C/i);
          if (m?.[1]) pushPair(targetLabel, m[1], 'targeted_hot_water');
        }
      }
    }

    const visibleText = cleanText(document.body?.innerText || '');
    const hiddenText = cleanText(document.body?.textContent || '');
    const bodyText = `${visibleText}\n${hiddenText}`.trim();

    const unique = new Map();
    for (const pair of pairs) {
      const key = `${pair.label.toLowerCase()}::${pair.value.toLowerCase()}`;
      if (!unique.has(key)) unique.set(key, pair);
    }

    return { pairs: Array.from(unique.values()), bodyText };
  });
}

async function snapshotFromPageFrames(page) {
  const frames = page.frames();
  const values = [];
  const texts = [];

  for (const frame of frames) {
    try {
      const { pairs, bodyText } = await collectPairsFromFrame(frame);
      const frameUrl = frame.url();
      if (bodyText) texts.push(bodyText);
      for (const pair of pairs) values.push({ ...pair, frameUrl });
    } catch {
      // ignore
    }
  }

  const dedup = new Map();
  for (const item of values) {
    const key = `${item.label.toLowerCase()}::${item.value.toLowerCase()}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }

  const deduped = Array.from(dedup.values()).sort((a, b) => a.label.localeCompare(b.label));
  return {
    count: deduped.length,
    keys: deduped.map((x) => x.label.toLowerCase()).slice(0, 250),
    values: deduped,
    textBlob: texts.join('\n')
  };
}

async function clickTextInFrames(page, matcher) {
  for (const frame of page.frames()) {
    try {
      const clicked = await frame.evaluate(({ source, flags }) => {
        const re = new RegExp(source, flags);
        const nodes = Array.from(document.querySelectorAll('button,summary,a,div,span,h1,h2,h3,h4,h5,li')).filter(
          (el) => re.test(String(el.textContent || '').replace(/\s+/g, ' ').trim())
        );
        for (const node of nodes) {
          const target = node.closest('button,summary,a,[role="button"],div,li') || node;
          const rect = target.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          target.scrollIntoView({ behavior: 'instant', block: 'center' });
          target.click();
          return true;
        }
        return false;
      }, { source: matcher.source, flags: matcher.flags });

      if (clicked) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

async function expandHotWaterSections(page) {
  const clicked =
    (await clickTextInFrames(page, /^hot\s*water$/i)) ||
    (await clickTextInFrames(page, /^domestic\s*hot\s*water$/i)) ||
    (await clickTextInFrames(page, /hot\s*water/i));

  if (clicked) await page.waitForTimeout(900);
}

async function forceOpenHotWater(page) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(450);
    await expandHotWaterSections(page);

    const probe = await snapshotFromPageFrames(page);
    const txt = clean(probe.textBlob).toLowerCase();
    if (
      txt.includes('hot water') &&
      txt.includes('current temperature') &&
      txt.includes('comfort temperature') &&
      txt.includes('reduced temperature')
    ) {
      return true;
    }
  }

  return false;
}

async function clickRefreshInFrames(page) {
  let clicked = false;
  for (const frame of page.frames()) {
    try {
      const didClick = await frame.evaluate(() => {
        const cleanText = (text) =>
          String(text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const candidates = Array.from(document.querySelectorAll('button,a,div,span,[role="button"]')).filter(
          (el) => cleanText(el.textContent) === 'refresh'
        );

        for (const el of candidates) {
          const target = el.closest('button,a,[role="button"],div,span') || el;
          const rect = target.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          target.scrollIntoView({ behavior: 'instant', block: 'center' });
          target.click();
          return true;
        }
        return false;
      });

      if (didClick) clicked = true;
    } catch {
      // ignore frame eval errors
    }
  }
  return clicked;
}

function pickFromVmEntries(entries, patterns) {
  for (const entry of entries) {
    const key = clean(entry.key).toLowerCase();
    if (patterns.some((re) => re.test(key))) {
      return clean(entry.value);
    }
  }
  return null;
}

async function extractHotWaterFromViewModel(page) {
  for (const frame of page.frames()) {
    try {
      const entries = await frame.evaluate(() => {
        const vm = globalThis?.my?.currPage?.bsbDhwViewModel;
        if (!vm || typeof vm !== 'object') return [];

        const out = [];
        const seen = new Set();

        const push = (key, value) => {
          if (value === null || value === undefined) return;
          const k = String(key);
          const v = String(value);
          const dedupKey = `${k}::${v}`;
          if (seen.has(dedupKey)) return;
          seen.add(dedupKey);
          out.push({ key: k, value: v });
        };

        for (const [key, raw] of Object.entries(vm)) {
          try {
            if (typeof raw === 'function') {
              // Knockout observables are often zero-arg functions.
              const value = raw.length === 0 ? raw() : null;
              push(key, value);
            } else if (raw && typeof raw === 'object') {
              if (typeof raw.value === 'function') {
                push(`${key}.value`, raw.value());
              }
              if (typeof raw.text === 'function') {
                push(`${key}.text`, raw.text());
              }
              if ('value' in raw && typeof raw.value !== 'function') {
                push(`${key}.value`, raw.value);
              }
              if ('text' in raw && typeof raw.text !== 'function') {
                push(`${key}.text`, raw.text);
              }
            } else {
              push(key, raw);
            }
          } catch {
            // Ignore individual property read errors.
          }
        }

        return out;
      });

      if (!entries.length) continue;

      const current = pickFromVmEntries(entries, [/current.*temp/, /dhw.*temp.*current/, /tww.*current/]);
      const comfort = pickFromVmEntries(entries, [/comfort.*temp/, /setpoint.*comfort/, /dhw.*comfort/]);
      const reduced = pickFromVmEntries(entries, [/reduced.*temp/, /setpoint.*reduced/, /dhw.*reduced/]);
      const mode = pickFromVmEntries(entries, [/operation.*mode/, /mode/]);

      if (current || comfort || reduced || mode) {
        return { current, comfort, reduced, mode };
      }
    } catch {
      // Ignore frame evaluation errors.
    }
  }

  return null;
}

async function expandMaintenanceSections(page) {
  // Navigate to OTHER SETTINGS first.
  try {
    await page.locator('#navMenuItem_BsbUserMenu').first().click({ timeout: 6000 });
    await page.waitForSelector('#partial-ctrl-plantmenubsb.act-usermenu', { timeout: 15000 });
  } catch {
    const openOtherSettings =
      (await clickTextInFrames(page, /^other\s*settings$/i)) ||
      (await clickTextInFrames(page, /other\s*settings/i)) ||
      (await clickSelectorInFrames(page, '#navMenuItem_BsbUserMenu'));
    if (openOtherSettings) await page.waitForTimeout(1400);
  }

  // Expand Service/special operation.
  let openServiceSection = false;
  try {
    await page.locator('#user_Service_special_operation_accordion_lev0 button').first().click({ timeout: 5000 });
    openServiceSection = true;
  } catch {
    openServiceSection =
      (await clickSelectorInFrames(page, '#user_Service_special_operation_accordion_lev0 button')) ||
      (await clickTextInFrames(page, /^service\s*\/?\s*special\s*operation$/i)) ||
      (await clickTextInFrames(page, /service.*special.*operation/i));
  }
  if (openServiceSection) await page.waitForTimeout(1100);

  // Expand 7000 - Message.
  let open7000 = false;
  try {
    await page.locator('#user_Service_special_operation_7000___Message_accordion_lev1 button').first().click({
      timeout: 5000
    });
    open7000 = true;
  } catch {
    open7000 =
      (await clickSelectorInFrames(page, '#user_Service_special_operation_7000___Message_accordion_lev1 button')) ||
      (await clickTextInFrames(page, /^7000\s*-\s*message$/i)) ||
      (await clickTextInFrames(page, /7000.*message/i));
  }
  if (open7000) await page.waitForTimeout(1200);
}

async function clickSelectorInFrames(page, selector) {
  for (const frame of page.frames()) {
    try {
      const clicked = await frame.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const target = el.closest('button,a,[role="button"],div,span') || el;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        target.scrollIntoView({ behavior: 'instant', block: 'center' });
        target.click();
        return true;
      }, selector);
      if (clicked) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

async function readMaintenanceFieldsFromFrames(page) {
  for (const frame of page.frames()) {
    try {
      const values = await frame.evaluate(() => {
        const cleanText = (text) =>
          String(text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const out = {};
        const panel =
          document.querySelector('#user_Service_special_operation_accordion_lev0_dataPoints') || document.body;
        const inputs = Array.from(panel.querySelectorAll('input.form-control, input[id^="field_"]'));

        for (const input of inputs) {
          const col = input.closest('.col,.form-floating,.accordion-body') || input.parentElement;
          const label = cleanText(
            col?.querySelector('label')?.textContent ||
              col?.querySelector('.text-truncate')?.textContent ||
              ''
          );
          const value = cleanText(input.value || input.getAttribute('value') || input.getAttribute('aria-valuenow'));
          if (!label || !value) continue;

          if (/^maintenance\s*code\s*1$/i.test(label)) out.maintenance_code_1 = value;
          if (/^maintenance\s*code\s*2$/i.test(label)) out.maintenance_code_2 = value;
          if (/^maintenance\s*priority\s*1$/i.test(label)) out.maintenance_priority_1 = value;
          if (/^maintenance\s*priority\s*2$/i.test(label)) out.maintenance_priority_2 = value;
        }

        return out;
      });

      if (values && Object.keys(values).length) return values;
    } catch {
      // Ignore frame evaluation errors.
    }
  }

  return {};
}

function parseMaintenanceMetrics(values) {
  const metrics = [];
  const code1 = clean(values.maintenance_code_1 || '');
  const code2 = clean(values.maintenance_code_2 || '');
  const priority1 = toNumber(values.maintenance_priority_1);
  const priority2 = toNumber(values.maintenance_priority_2);

  if (code1) {
    metrics.push({
      key: 'maintenance_code_1',
      label: 'Maintenance Code 1',
      value: code1,
      numberValue: null,
      unit: null
    });
  }
  if (code2) {
    metrics.push({
      key: 'maintenance_code_2',
      label: 'Maintenance Code 2',
      value: code2,
      numberValue: null,
      unit: null
    });
  }
  if (priority1 !== null) {
    metrics.push({
      key: 'maintenance_priority_1',
      label: 'Maintenance Priority 1',
      value: String(priority1),
      numberValue: priority1,
      unit: null
    });
  }
  if (priority2 !== null) {
    metrics.push({
      key: 'maintenance_priority_2',
      label: 'Maintenance Priority 2',
      value: String(priority2),
      numberValue: priority2,
      unit: null
    });
  }

  return metrics;
}

async function extractMaintenanceMetrics(page) {
  try {
    await expandMaintenanceSections(page);

    // Values are populated asynchronously; wait for at least one non-empty field.
    const started = Date.now();
    let values = {};
    while (Date.now() - started < 12000) {
      values = await readMaintenanceFieldsFromFrames(page);
      if (
        values.maintenance_code_1 ||
        values.maintenance_code_2 ||
        values.maintenance_priority_1 ||
        values.maintenance_priority_2
      ) {
        break;
      }
      await page.waitForTimeout(500);
    }

    return parseMaintenanceMetrics(values);
  } catch {
    return [];
  }
}

async function expandHeatingCircuitSections(page) {
  try {
    await page.locator('#navMenuItem_BsbUserMenu').first().click({ timeout: 6000 });
    await page.waitForSelector('#partial-ctrl-plantmenubsb.act-usermenu', { timeout: 15000 });
  } catch {
    const openOtherSettings =
      (await clickTextInFrames(page, /^other\s*settings$/i)) ||
      (await clickTextInFrames(page, /other\s*settings/i)) ||
      (await clickSelectorInFrames(page, '#navMenuItem_BsbUserMenu'));
    if (openOtherSettings) await page.waitForTimeout(1200);
  }

  let openHeatingCircuit = false;
  try {
    await page.locator('#user_Heating_circuit_1_accordion_lev0 button').first().click({ timeout: 5000 });
    openHeatingCircuit = true;
  } catch {
    openHeatingCircuit =
      (await clickSelectorInFrames(page, '#user_Heating_circuit_1_accordion_lev0 button')) ||
      (await clickTextInFrames(page, /^heating\s*circuit\s*1$/i)) ||
      (await clickTextInFrames(page, /heating\s*circuit\s*1/i));
  }
  if (openHeatingCircuit) await page.waitForTimeout(1000);
}

async function readHeatingCircuitFieldsFromFrames(page) {
  for (const frame of page.frames()) {
    try {
      const values = await frame.evaluate(() => {
        const cleanText = (text) =>
          String(text || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const panel = document.querySelector('#user_Heating_circuit_1_accordion_lev0_dataPoints');
        if (!panel) return {};
        const out = {};

        const fieldBlocks = Array.from(panel.querySelectorAll('.form-floating'));
        for (const block of fieldBlocks) {
          const label = cleanText(block.querySelector('label')?.textContent || '');
          const codeMatch = label.match(/^(\d{3})\s*-/);
          if (!codeMatch) continue;

          const code = codeMatch[1];
          const select = block.querySelector('select:not([id$="_osv"])');
          const input = block.querySelector(
            'input.form-control:not(.gfm-osv-placeholder):not([id$="_osv"]):not([id$="_osv_checkbox"]), textarea'
          );
          const selected = select?.options?.[select.selectedIndex];
          const value = cleanText(
            selected?.textContent ||
              select?.value ||
              input?.value ||
              input?.getAttribute('value') ||
              input?.getAttribute('aria-valuenow')
          );
          if (!value) continue;

          if (code === '700') out.heating_circuit_700_operating_mode = value;
          if (code === '710') out.heating_circuit_710_comfort_setpoint = value;
          if (code === '712') out.heating_circuit_712_reduced_setpoint = value;
          if (code === '714') out.heating_circuit_714_frost_protection_setpoint = value;
          if (code === '720') out.heating_circuit_720_heating_curve_slope = value;
          if (code === '730') out.heating_circuit_730_summer_winter_heating_limit = value;
        }

        return out;
      });

      if (values && Object.keys(values).length) return values;
    } catch {
      // ignore frame evaluation errors
    }
  }
  return {};
}

function parseHeatingCircuitMetrics(values) {
  const metrics = [];
  const m700 = clean(values.heating_circuit_700_operating_mode || '');
  const m710 = toNumber(values.heating_circuit_710_comfort_setpoint);
  const m712 = toNumber(values.heating_circuit_712_reduced_setpoint);
  const m714 = toNumber(values.heating_circuit_714_frost_protection_setpoint);
  const m720 = toNumber(values.heating_circuit_720_heating_curve_slope);
  const m730 = toNumber(values.heating_circuit_730_summer_winter_heating_limit);

  if (m700 && m700 !== '-' && m700 !== '- -') {
    metrics.push({
      key: 'heating_circuit_700_operating_mode',
      label: 'Heating Circuit 700 Operating Mode',
      value: m700,
      numberValue: null,
      unit: null
    });
  }
  if (m710 !== null && m710 > 3) {
    metrics.push({
      key: 'heating_circuit_710_comfort_setpoint',
      label: 'Heating Circuit 710 Comfort Setpoint',
      value: `${m710} °C`,
      numberValue: m710,
      unit: '°C'
    });
  }
  if (m712 !== null && m712 > 3) {
    metrics.push({
      key: 'heating_circuit_712_reduced_setpoint',
      label: 'Heating Circuit 712 Reduced Setpoint',
      value: `${m712} °C`,
      numberValue: m712,
      unit: '°C'
    });
  }
  if (m714 !== null && m714 > 3) {
    metrics.push({
      key: 'heating_circuit_714_frost_protection_setpoint',
      label: 'Heating Circuit 714 Frost Protection Setpoint',
      value: `${m714} °C`,
      numberValue: m714,
      unit: '°C'
    });
  }
  if (m720 !== null && m720 > 0) {
    metrics.push({
      key: 'heating_circuit_720_heating_curve_slope',
      label: 'Heating Circuit 720 Heating Curve Slope',
      value: String(m720),
      numberValue: m720,
      unit: null
    });
  }
  if (m730 !== null && m730 > 3) {
    metrics.push({
      key: 'heating_circuit_730_summer_winter_heating_limit',
      label: 'Heating Circuit 730 Summer/Winter Heating Limit',
      value: `${m730} °C`,
      numberValue: m730,
      unit: '°C'
    });
  }

  return metrics;
}

async function extractHeatingCircuitMetrics(page) {
  try {
    await expandHeatingCircuitSections(page);
    const started = Date.now();
    let values = {};
    let parsed = [];
    while (Date.now() - started < 12000) {
      values = await readHeatingCircuitFieldsFromFrames(page);
      parsed = parseHeatingCircuitMetrics(values);
      if (parsed.length >= 6) break;
      await page.waitForTimeout(500);
    }
    return parsed.length ? parsed : parseHeatingCircuitMetrics(values);
  } catch {
    return [];
  }
}

async function tryScrapeFromLiveChromeCdp() {
  const endpoint = process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222';
  let browser = null;
  try {
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());

    await page.goto(HEATING_DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await forceOpenHotWater(page);

    const vmHotWater = await extractHotWaterFromViewModel(page);
    const snapshot = await waitForStableData(page);
    const { selected } = buildSelectedMetrics(snapshot, vmHotWater);

    if (hotWaterLooksValid(selected)) {
      return selected;
    }
  } catch {
    // best effort fallback
  }

  return null;
}

async function writeDebugArtifacts(page, reason) {
  ensureDir(OUTPUT_DIR);
  const stamp = new Date().toISOString().replace(/[.:]/g, '-');
  const screenshotPath = path.join(OUTPUT_DIR, `heating-debug-${stamp}.png`);
  const htmlPath = path.join(OUTPUT_DIR, `heating-debug-${stamp}.html`);
  const metaPath = path.join(OUTPUT_DIR, `heating-debug-${stamp}.json`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {}

  try {
    fs.writeFileSync(htmlPath, await page.content());
  } catch {}

  try {
    fs.writeFileSync(
      metaPath,
      `${JSON.stringify({ reason, pageUrl: page.url(), capturedAt: new Date().toISOString() }, null, 2)}\n`
    );
  } catch {}

  return { screenshotPath, htmlPath, metaPath };
}

async function waitForStableData(page) {
  const started = Date.now();
  let stablePasses = 0;
  let lastSnapshot = '';
  let best = { count: 0, values: [], textBlob: '' };

  while (Date.now() - started < SCRAPE_MAX_WAIT_MS) {
    await page.waitForTimeout(SCRAPE_POLL_DELAY_MS);
    const snapshot = await snapshotFromPageFrames(page);

    if (snapshot.count > best.count) best = snapshot;

    const current = JSON.stringify(snapshot.keys);
    if (current === lastSnapshot && snapshot.count > 0) {
      stablePasses += 1;
      if (stablePasses >= SCRAPE_STABLE_PASSES) return snapshot;
    } else {
      stablePasses = 0;
      lastSnapshot = current;
    }
  }

  if (best.count > 0) return best;

  const artifacts = await writeDebugArtifacts(page, 'no_metrics_found');
  throw new Error(
    `Timed out waiting for data and found no metrics. Debug: ${artifacts.metaPath}, ${artifacts.screenshotPath}, ${artifacts.htmlPath}`
  );
}

async function scrapeHeating() {
  if (!fs.existsSync(HEATING_STORAGE_STATE_PATH)) {
    if (hasLoginCredentials()) {
      await setupHeatingLoginWithCredentials();
    } else {
      throw new Error(
        `Missing heating auth state at ${HEATING_STORAGE_STATE_PATH}. Run: npm run setup:heating:login`
      );
    }
  }

  let browser = await chromium.launch(launchOptions(true));

  let context = await browser.newContext({ storageState: HEATING_STORAGE_STATE_PATH });
  let page = await context.newPage();

  await page.goto(HEATING_DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  let pageUrl = page.url();
  if (/login|signin|account/i.test(pageUrl) && !pageUrl.includes('/BsbPlantDashboard/')) {
    await context.close();
    await browser.close();

    if (hasLoginCredentials()) {
      await setupHeatingLoginWithCredentials();
    } else if (canUseChromeCdpRefresh()) {
      await refreshAuthStateFromChromeCdp();
    } else {
      throw new Error(
        `Session unauthenticated and no credentials configured for auto-login. Current URL: ${pageUrl}`
      );
    }

    const retryBrowser = await chromium.launch(launchOptions(true));
    browser = retryBrowser;
    context = await browser.newContext({ storageState: HEATING_STORAGE_STATE_PATH });
    page = await context.newPage();
    await page.goto(HEATING_DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    pageUrl = page.url();
    if (/login|signin|account/i.test(pageUrl) && !pageUrl.includes('/BsbPlantDashboard/')) {
      await browser.close();
      throw new Error(
        `Session still unauthenticated after CDP refresh. Current URL: ${pageUrl}. ` +
          `Ensure Chrome is running on ${process.env.CHROME_CDP_URL || 'http://127.0.0.1:9222'} and logged in.`
      );
    }
  }

  // Force-open hot-water accordion before snapshot.
  await forceOpenHotWater(page);
  const vmHotWater = await extractHotWaterFromViewModel(page);
  await page.mouse.wheel(0, -4800);
  await page.waitForTimeout(700);

  const gatewayId = gatewayIdFromUrl(HEATING_DASHBOARD_URL) || gatewayIdFromUrl(pageUrl);
  const apiPlantData = await fetchPlantHomeBsbData(context, gatewayId);

  let snapshot = await waitForStableData(page);
  let vmData = vmHotWater;
  let { rawMetrics, selected } = buildSelectedMetrics(snapshot, vmData);

  // Auto-recovery: if hot-water values are missing/default, click Refresh and retry.
  for (let attempt = 0; attempt < 3 && !hotWaterLooksValid(selected); attempt += 1) {
    const refreshed = await clickRefreshInFrames(page);
    if (!refreshed) break;
    await page.waitForTimeout(3000);
    await forceOpenHotWater(page);
    vmData = (await extractHotWaterFromViewModel(page)) || vmData;
    snapshot = await waitForStableData(page);
    ({ rawMetrics, selected } = buildSelectedMetrics(snapshot, vmData));
  }

  if (!hotWaterLooksValid(selected)) {
    const cached = loadLastGoodHotWater();
    if (cached?.length) {
      for (const metric of cached) upsertMetric(selected, metric);
    }
  }

  // Authoritative overrides from PlantHomeBsb JSON API.
  if (apiPlantData) {
    const current = toNumber(apiPlantData.dhwStorageTemp);
    const comfort = toNumber(apiPlantData?.dhwComfortTemp?.value);
    const reduced = toNumber(apiPlantData?.dhwReducedTemp?.value);
    const outside = toNumber(apiPlantData.outsideTemp);
    const modeValue = apiPlantData?.dhwMode?.value;
    const modeText = Array.isArray(apiPlantData?.dhwMode?.options)
      ? apiPlantData.dhwMode.options.find((o) => o?.value === modeValue)?.text
      : null;

    if (outside !== null) {
      upsertMetric(selected, {
        key: 'outside_temperature',
        label: 'Outside Temperature',
        value: `${outside} °C`,
        numberValue: outside,
        unit: '°C'
      });
    }
    if (current !== null && current > 0) {
      upsertMetric(selected, {
        key: 'hot_water_current_temperature',
        label: 'Hot Water Current Temperature',
        value: `${current} °C`,
        numberValue: current,
        unit: '°C'
      });
    }
    if (comfort !== null && comfort > 0) {
      upsertMetric(selected, {
        key: 'hot_water_comfort_temperature',
        label: 'Hot Water Comfort Temperature',
        value: `${comfort} °C`,
        numberValue: comfort,
        unit: '°C'
      });
    }
    if (reduced !== null && reduced > 0) {
      upsertMetric(selected, {
        key: 'hot_water_reduced_temperature',
        label: 'Hot Water Reduced Temperature',
        value: `${reduced} °C`,
        numberValue: reduced,
        unit: '°C'
      });
    }
    if (modeText) {
      const mode = normalizeOperationMode(modeText);
      if (mode) {
        upsertMetric(selected, {
          key: 'hot_water_operation_mode',
          label: 'Hot Water Operation Mode',
          value: mode,
          numberValue: null,
          unit: null
        });
      }
    }
  }

  // Last-resort fallback to cache if API + DOM still do not provide valid hot-water values.
  if (!hotWaterLooksValid(selected)) {
    const cached = loadLastGoodHotWater();
    if (cached?.length) {
      for (const metric of cached) upsertMetric(selected, metric);
    }
  }

  if (hotWaterLooksValid(selected)) {
    saveLastGoodHotWater(selected);
  }

  // Best effort: add maintenance fields from OTHER SETTINGS -> Service/special operation -> 7000 - Message.
  const maintenanceMetrics = await extractMaintenanceMetrics(page);
  for (const metric of maintenanceMetrics) {
    upsertMetric(selected, metric);
  }

  const heatingCircuitMetrics = await extractHeatingCircuitMetrics(page);
  for (const metric of heatingCircuitMetrics) {
    upsertMetric(selected, metric);
  }

  await browser.close();

  if (DEBUG_RAW) {
    ensureDir(OUTPUT_DIR);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `heating-raw-debug-${todayStamp()}.json`),
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          vmHotWater: vmData,
          rawMetrics,
          selected,
          textSample: clean(snapshot.textBlob).slice(0, 20000)
        },
        null,
        2
      )}\n`
    );
  }

  const payload = {
    capturedAt: new Date().toISOString(),
    url: HEATING_DASHBOARD_URL,
    metrics: selected,
    metricCount: selected.length
  };

  ensureDir(OUTPUT_DIR);
  const filePath = path.join(OUTPUT_DIR, `heating-metrics-${todayStamp()}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);

  return { payload, filePath };
}

export { scrapeHeating };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  scrapeHeating()
    .then(({ payload, filePath }) => {
      console.log(`Captured ${payload.metricCount} heating metrics to ${filePath}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
