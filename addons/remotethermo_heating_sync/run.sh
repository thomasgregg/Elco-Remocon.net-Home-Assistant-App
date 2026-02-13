#!/usr/bin/with-contenv bashio
set -euo pipefail

export HEATING_DATA_DIR="/data"
export HEATING_DISABLE_CDP_REFRESH="1"

export HEATING_DASHBOARD_URL="$(bashio::config 'dashboard_url')"
export HEATING_LOGIN_URL="$(bashio::config 'login_url')"
export HEATING_LOGIN_USERNAME="$(bashio::config 'login_username')"
export HEATING_LOGIN_PASSWORD="$(bashio::config 'login_password')"
export BROWSER_CHANNEL="$(bashio::config 'browser_channel')"

export SCRAPE_MAX_WAIT_MS="$(bashio::config 'scrape_max_wait_ms')"
export SCRAPE_STABLE_PASSES="$(bashio::config 'scrape_stable_passes')"
export SCRAPE_POLL_DELAY_MS="$(bashio::config 'scrape_poll_delay_ms')"

export WATCH_INTERVAL_MS="$(bashio::config 'watch_interval_ms')"
export WATCH_ERROR_BACKOFF_MS="$(bashio::config 'watch_error_backoff_ms')"

export MQTT_URL="$(bashio::config 'mqtt_url')"
export MQTT_USERNAME="$(bashio::config 'mqtt_username')"
export MQTT_PASSWORD="$(bashio::config 'mqtt_password')"
export MQTT_DISCOVERY_PREFIX="$(bashio::config 'mqtt_discovery_prefix')"
export MQTT_STATE_TOPIC="$(bashio::config 'mqtt_state_topic')"

export HA_DEVICE_NAME="$(bashio::config 'ha_device_name')"
export HA_DEVICE_ID="$(bashio::config 'ha_device_id')"
export HEATING_ALLOWED_KEYS="$(bashio::config 'allowed_keys_csv')"

export HEATING_STORAGE_STATE_PATH="/data/playwright/.auth/remotethermo.json"
if [[ -x /usr/bin/chromium-browser ]]; then
  export HEATING_BROWSER_EXECUTABLE_PATH="/usr/bin/chromium-browser"
elif [[ -x /usr/bin/chromium ]]; then
  export HEATING_BROWSER_EXECUTABLE_PATH="/usr/bin/chromium"
fi

echo "Starting RemoteThermo watcher"
echo "Dashboard: ${HEATING_DASHBOARD_URL}"
echo "MQTT: ${MQTT_URL}"
echo "State path: ${HEATING_STORAGE_STATE_PATH}"

node /app/src/watchHeating.js
