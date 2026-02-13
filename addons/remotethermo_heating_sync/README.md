# ELCO Remocon.net Heating MQTT Sync

Home Assistant add-on that runs the scraper inside Home Assistant and publishes MQTT discovery/state topics.

Install via Home Assistant:

1. Open `Settings -> Apps`.
2. Open the app store/repository management view.
3. Add repository:
   - `https://github.com/thomasgregg/Elco-Remocon.net-Home-Assistant-App`
4. Install:
   - `ELCO Remocon.net Heating MQTT Sync`

## What It Does

- Reads operational data from your ELCO heat pump via ELCO Remocon.net
- Converts data into MQTT state updates
- Auto-creates Home Assistant entities via MQTT Discovery
- Updates values on interval and publishes only changed metrics

## Required add-on options

- `dashboard_url`
- `mqtt_url` (usually `mqtt://core-mosquitto:1883`)
- `mqtt_username` / `mqtt_password` if broker auth is enabled

## Login

Set:

- `login_username`
- `login_password`

## All add-on options

- `dashboard_url`: ELCO dashboard URL for your gateway
- `login_url`: login entry URL
- `login_username`: ELCO account user/email
- `login_password`: ELCO account password
- `scrape_max_wait_ms`: max dynamic-load wait per cycle
- `scrape_stable_passes`: required stable snapshot passes
- `scrape_poll_delay_ms`: delay between snapshot polls
- `watch_interval_ms`: regular scrape interval
- `watch_error_backoff_ms`: retry delay after errors
- `mqtt_url`: MQTT broker URL
- `mqtt_username`: MQTT username
- `mqtt_password`: MQTT password
- `mqtt_discovery_prefix`: discovery prefix (`homeassistant`)
- `mqtt_state_topic`: base state topic (`elco_remocon/heating/state`)
- `ha_device_name`: Home Assistant device name
- `ha_device_id`: Home Assistant device/unique ID prefix
- `allowed_keys_csv`: comma-separated metric key allowlist

The add-on will create and reuse session state at:

- `/data/playwright/.auth/remotethermo.json`

## Notes

- The add-on publishes only keys listed in `allowed_keys_csv`.
- If session expires, auto-login is retried using configured credentials.
