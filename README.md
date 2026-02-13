# Elco-Remocon.net-Home-Assistant-App

Home Assistant add-on repository for reading data from an ELCO heat pump via ELCO Remocon.net and exposing that data as MQTT-discovered entities in Home Assistant.

## What The Add-on Does

- Logs into your ELCO Remocon.net account
- Opens your ELCO heat pump dashboard
- Scrapes selected heating, hot water, maintenance, and heating-circuit values
- Publishes those values to MQTT state topics
- Publishes Home Assistant MQTT Discovery configs so entities/sensors appear automatically in Home Assistant
- Repeats on an interval and only publishes changed values

## Repository Structure

- `repository.yaml`: Home Assistant add-on repository metadata
- `addons/remotethermo_heating_sync`: add-on package

## Add to Home Assistant

1. Open `Settings -> Add-ons -> Add-on Store -> Repositories`.
2. Add this repository URL:
   - `https://github.com/thomasgregg/Elco-Remocon.net-Home-Assistant-App`
3. Install:
   - `ELCO Remocon.net Heating MQTT Sync`

## Required Add-on Options

- `dashboard_url`
- `login_url`
- `login_username`
- `login_password`
- `mqtt_url` (usually `mqtt://core-mosquitto:1883`)
- `mqtt_username` / `mqtt_password` (if broker auth is enabled)

## All Add-on Options

- `dashboard_url`:
  - ELCO Remocon.net dashboard URL for your gateway/device.
  - Example: `https://www.remocon-net.remotethermo.com/BsbPlantDashboard/Index/<GATEWAY_ID>`
- `login_url`:
  - Login entry URL used before navigating to dashboard.
  - Usually same domain as `dashboard_url`.
- `login_username`:
  - ELCO Remocon.net account username/email.
- `login_password`:
  - ELCO Remocon.net account password.
- `scrape_max_wait_ms`:
  - Max time to wait for dynamic page data each scrape cycle.
  - Default: `90000`
- `scrape_stable_passes`:
  - Number of stable snapshot passes required before accepting data.
  - Default: `4`
- `scrape_poll_delay_ms`:
  - Polling delay between snapshot checks.
  - Default: `2000`
- `watch_interval_ms`:
  - Time between scrape/publish cycles.
  - Default: `300000` (5 minutes)
- `watch_error_backoff_ms`:
  - Retry delay after a failed cycle.
  - Default: `60000`
- `mqtt_url`:
  - MQTT broker URL.
  - Typical Home Assistant value: `mqtt://core-mosquitto:1883`
- `mqtt_username`:
  - MQTT username (if broker auth is enabled).
- `mqtt_password`:
  - MQTT password (if broker auth is enabled).
- `mqtt_discovery_prefix`:
  - Home Assistant discovery prefix.
  - Default: `homeassistant`
- `mqtt_state_topic`:
  - Base state topic prefix.
  - Default: `elco_remocon/heating/state`
- `ha_device_name`:
  - Device name shown in Home Assistant.
  - Default: `ELCO Remocon.net Heating`
- `ha_device_id`:
  - Stable device/entity ID prefix used for discovery unique IDs.
  - Default: `elco_remocon_heating`
- `allowed_keys_csv`:
  - Comma-separated list of metric keys to publish.
  - Use this to strictly control which entities appear in Home Assistant.

## Persistence

The add-on persists state in:

- `/data/playwright/.auth/remotethermo.json`
- `/data/output/heating-metrics-YYYY-MM-DD.json`
