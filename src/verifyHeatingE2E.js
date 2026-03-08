const DEFAULT_REQUIRED_KEYS = [
  'heating_active',
  'gateway_serial',
  'status',
  'location',
  'outside_temperature',
  'hot_water_current_temperature',
  'hot_water_comfort_temperature',
  'hot_water_reduced_temperature',
  'hot_water_operation_mode',
  'maintenance_code_1',
  'maintenance_code_2',
  'maintenance_priority_1',
  'maintenance_priority_2',
  'heating_circuit_700_operating_mode',
  'heating_circuit_710_comfort_setpoint',
  'heating_circuit_712_reduced_setpoint',
  'heating_circuit_714_frost_protection_setpoint',
  'heating_circuit_720_heating_curve_slope',
  'heating_circuit_730_summer_winter_heating_limit'
];

const minMetricCount = Number.parseInt(process.env.VERIFY_MIN_METRICS || '19', 10);
const requiredKeys = String(process.env.VERIFY_REQUIRED_KEYS || DEFAULT_REQUIRED_KEYS.join(','))
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

function fail(message, details = null) {
  console.error(`[VERIFY:E2E] FAIL: ${message}`);
  if (details) {
    console.error(`[VERIFY:E2E] DETAILS: ${details}`);
  }
  process.exit(1);
}

function ok(message) {
  console.log(`[VERIFY:E2E] OK: ${message}`);
}

async function main() {
  // Verification should not depend on an external local Chrome CDP endpoint.
  process.env.HEATING_DISABLE_CDP_REFRESH = '1';

  const { scrapeHeating } = await import('./scrapeHeatingDashboard.js');

  let result;
  try {
    result = await scrapeHeating();
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.includes('Missing heating auth state')) {
      fail(
        'Missing auth session for E2E run. Provide login_username/login_password or create storage state first.',
        msg
      );
    }
    if (msg.includes('Session unauthenticated and no credentials configured')) {
      fail('E2E requires configured login credentials when no valid stored session exists.', msg);
    }
    throw error;
  }

  const { payload, filePath } = result;
  const metricCount = payload.metricCount || 0;
  const keys = new Set((payload.metrics || []).map((m) => m.key));

  if (metricCount < minMetricCount) {
    fail(
      `Metric count below threshold (${metricCount} < ${minMetricCount}).`,
      `Output file: ${filePath}`
    );
  }

  const missing = requiredKeys.filter((key) => !keys.has(key));
  if (missing.length > 0) {
    fail(
      `Missing required keys (${missing.length}/${requiredKeys.length}).`,
      `Missing: ${missing.join(', ')}`
    );
  }

  ok(`Captured ${metricCount} metrics. Required keys present: ${requiredKeys.length}.`);
  console.log(`[VERIFY:E2E] Output: ${filePath}`);
}

main().catch((error) => {
  fail(error?.message || 'Unknown error', error?.stack || null);
});
