import mqtt from 'mqtt';
import {
  HA_DEVICE_ID,
  HA_DEVICE_NAME,
  MQTT_DISCOVERY_PREFIX,
  MQTT_PASSWORD,
  MQTT_STATE_TOPIC,
  MQTT_URL,
  MQTT_USERNAME
} from './heatingConfig.js';

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function buildDiscoveryConfig(metric) {
  const isBinary = typeof metric.value === 'boolean';
  const component = isBinary ? 'binary_sensor' : 'sensor';
  const objectId = `${HA_DEVICE_ID}_${metric.key}`;
  const discoveryTopic = `${MQTT_DISCOVERY_PREFIX}/${component}/${HA_DEVICE_ID}/${objectId}/config`;
  const stateTopic = `${MQTT_STATE_TOPIC}/${metric.key}`;

  const payload = {
    name: metric.label,
    unique_id: objectId,
    state_topic: stateTopic,
    device: {
      identifiers: [HA_DEVICE_ID],
      name: HA_DEVICE_NAME,
      manufacturer: 'RemoteThermo',
      model: 'BsbPlantDashboard'
    }
  };

  if (metric.unit) {
    payload.unit_of_measurement = metric.unit;
  }

  if (typeof metric.numberValue === 'number') {
    payload.state_class = 'measurement';
  }

  if (isBinary) {
    payload.payload_on = 'ON';
    payload.payload_off = 'OFF';
  }

  const lname = metric.label.toLowerCase();
  if (lname.includes('temp')) payload.device_class = 'temperature';
  if (lname.includes('pressure')) payload.device_class = 'pressure';

  return { discoveryTopic, payload, stateTopic };
}

function connectMqtt() {
  if (!MQTT_URL) {
    throw new Error('MQTT_URL is required.');
  }

  return mqtt.connect(MQTT_URL, {
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    reconnectPeriod: 0
  });
}

function publish(client, topic, payload, options = {}) {
  const data =
    payload !== null && typeof payload === 'object' ? JSON.stringify(payload) : String(payload);

  return new Promise((resolve, reject) => {
    client.publish(topic, data, options, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function publishHeatingToHomeAssistant(metricsPayload, options = {}) {
  const metrics = metricsPayload.metrics || [];
  if (metrics.length === 0) {
    throw new Error('No metrics found. Nothing to publish.');
  }

  const onlyKeys = options.onlyKeys ? new Set(options.onlyKeys) : null;
  const filteredMetrics = onlyKeys ? metrics.filter((metric) => onlyKeys.has(metric.key)) : metrics;
  const publishDiscovery = options.publishDiscovery !== false;

  if (filteredMetrics.length === 0) {
    return {
      metricCount: 0,
      discoveryPrefix: MQTT_DISCOVERY_PREFIX,
      stateTopic: MQTT_STATE_TOPIC
    };
  }

  const client = connectMqtt();

  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });

  for (const metric of filteredMetrics) {
    const { discoveryTopic, payload, stateTopic } = buildDiscoveryConfig(metric);
    if (publishDiscovery) {
      await publish(client, discoveryTopic, payload, { retain: true, qos: 1 });
    }

    const metricValue =
      typeof metric.value === 'boolean'
        ? metric.value
          ? 'ON'
          : 'OFF'
        : typeof metric.numberValue === 'number'
          ? metric.numberValue
          : metric.value;
    await publish(client, stateTopic, metricValue, { retain: true, qos: 1 });
  }

  client.end(true);

  return {
    metricCount: filteredMetrics.length,
    discoveryPrefix: MQTT_DISCOVERY_PREFIX,
    stateTopic: `${MQTT_STATE_TOPIC}/<metric_key>`
  };
}

export { publishHeatingToHomeAssistant, slugify };
