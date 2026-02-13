import { scrapeHeating } from './scrapeHeatingDashboard.js';
import { publishHeatingToHomeAssistant } from './publishHeatingToHomeAssistant.js';
import { HEATING_ALLOWED_KEYS } from './heatingConfig.js';

async function main() {
  const { payload, filePath } = await scrapeHeating();
  console.log(`Captured ${payload.metricCount} metrics: ${filePath}`);

  const publishResult = await publishHeatingToHomeAssistant(payload, {
    onlyKeys: HEATING_ALLOWED_KEYS.length ? HEATING_ALLOWED_KEYS : undefined
  });
  console.log(
    `Published ${publishResult.metricCount} sensors via MQTT discovery (${publishResult.discoveryPrefix}) and state topic pattern ${publishResult.stateTopic}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
