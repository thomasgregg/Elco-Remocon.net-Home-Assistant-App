#!/usr/bin/env bash
set -euo pipefail

OPTIONS_FILE="/data/options.json"
if [[ ! -f "$OPTIONS_FILE" ]]; then
  echo "Missing $OPTIONS_FILE"
  exit 1
fi

json_get() {
  local key="$1"
  jq -er "$key" "$OPTIONS_FILE"
}

export HEATING_DATA_DIR="/data"
export HEATING_DISABLE_CDP_REFRESH="1"

export HEATING_DASHBOARD_URL="$(json_get '.dashboard_url')"
export HEATING_LOGIN_URL="$(json_get '.login_url')"
export HEATING_LOGIN_USERNAME="$(json_get '.login_username // ""')"
export HEATING_LOGIN_PASSWORD="$(json_get '.login_password // ""')"
export BROWSER_CHANNEL="$(json_get '.browser_channel')"

export SCRAPE_MAX_WAIT_MS="$(json_get '.scrape_max_wait_ms')"
export SCRAPE_STABLE_PASSES="$(json_get '.scrape_stable_passes')"
export SCRAPE_POLL_DELAY_MS="$(json_get '.scrape_poll_delay_ms')"

export WATCH_INTERVAL_MS="$(json_get '.watch_interval_ms')"
export WATCH_ERROR_BACKOFF_MS="$(json_get '.watch_error_backoff_ms')"

export MQTT_URL="$(json_get '.mqtt_url')"
export MQTT_USERNAME="$(json_get '.mqtt_username // ""')"
export MQTT_PASSWORD="$(json_get '.mqtt_password // ""')"
export MQTT_DISCOVERY_PREFIX="$(json_get '.mqtt_discovery_prefix')"
export MQTT_STATE_TOPIC="$(json_get '.mqtt_state_topic')"

export HA_DEVICE_NAME="$(json_get '.ha_device_name')"
export HA_DEVICE_ID="$(json_get '.ha_device_id')"
export HEATING_ALLOWED_KEYS="$(json_get '.allowed_keys_csv // ""')"

export HEATING_STORAGE_STATE_PATH="/data/playwright/.auth/remotethermo.json"

echo "Starting RemoteThermo watcher"
echo "Dashboard: ${HEATING_DASHBOARD_URL}"
echo "MQTT: ${MQTT_URL}"
echo "State path: ${HEATING_STORAGE_STATE_PATH}"

node /app/src/watchHeating.js
