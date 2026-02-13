import mqtt from 'mqtt';
import {
  HA_DEVICE_ID,
  MQTT_DISCOVERY_PREFIX,
  MQTT_PASSWORD,
  MQTT_STATE_TOPIC,
  MQTT_URL,
  MQTT_USERNAME
} from './heatingConfig.js';

const CURRENT_KEYS = new Set([
  'heating_active',
  'gateway_serial',
  'status',
  'location',
  'outside_temperature',
  'hot_water_current_temperature',
  'hot_water_comfort_temperature',
  'hot_water_reduced_temperature',
  'hot_water_operation_mode'
]);

const LEGACY_KEYS = [
  'active_care',
  'current_temperature',
  'details',
  'intensive_diagnostics',
  'owner_s_data',
  'phone_n_not_available',
  'report_due',
  'rvs_61_von_oppen_weg_30_14476_potsdam',
  'rvs_61_von_oppen_weg_30_14476_potsdam_status_online_status_offline',
  'status_online',
  'weather',
  'weather_2_6_c',
  'zone_settings',
  'zone_settings_zone_1_zone_1'
];

function connectMqtt() {
  if (!MQTT_URL) throw new Error('MQTT_URL is required.');
  return mqtt.connect(MQTT_URL, {
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    reconnectPeriod: 0
  });
}

function publish(client, topic, payload, options = {}) {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, options, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function clearRetained(client, topic) {
  await publish(client, topic, '', { retain: true, qos: 1 });
}

async function main() {
  const client = connectMqtt();
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });

  const keysToClear = LEGACY_KEYS.filter((k) => !CURRENT_KEYS.has(k));

  // Clear old JSON aggregate state payload (legacy format)
  await clearRetained(client, MQTT_STATE_TOPIC);

  // Clear old per-key state topics.
  for (const key of keysToClear) {
    await clearRetained(client, `${MQTT_STATE_TOPIC}/${key}`);
  }

  // Clear old HA discovery topics for both sensor and binary_sensor components.
  for (const key of keysToClear) {
    const objectId = `${HA_DEVICE_ID}_${key}`;
    await clearRetained(
      client,
      `${MQTT_DISCOVERY_PREFIX}/sensor/${HA_DEVICE_ID}/${objectId}/config`
    );
    await clearRetained(
      client,
      `${MQTT_DISCOVERY_PREFIX}/binary_sensor/${HA_DEVICE_ID}/${objectId}/config`
    );
  }

  client.end(true);

  console.log(
    `Cleared legacy retained MQTT topics for ${keysToClear.length} keys and base topic ${MQTT_STATE_TOPIC}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
