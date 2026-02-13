# ELCO Remocon.net Heating MQTT Sync

Home Assistant add-on that runs the scraper inside Home Assistant and publishes MQTT discovery/state topics.

## Install

1. Open `Settings -> Apps`.
2. Open the app store/repository management view.
3. Add repository:
   - `https://github.com/thomasgregg/Elco-Remocon.net-Home-Assistant-App`
4. Install:
   - `ELCO Remocon.net Heating MQTT Sync`

## What It Does

- Reads telemetry from ELCO Remocon.net for your heat pump
- Publishes retained MQTT discovery configs
- Publishes retained MQTT state values
- Publishes only changed values during watch cycles

## Configuration

### Required

| Option | Description |
|---|---|
| `dashboard_url` | Dashboard URL for your gateway (`.../BsbPlantDashboard/Index/<gateway_id>`) |
| `login_url` | Login entry URL |
| `login_username` | ELCO account username/email |
| `login_password` | ELCO account password |
| `mqtt_url` | MQTT broker URL, usually `mqtt://core-mosquitto:1883` |

### Optional

| Option | Default | Description |
|---|---:|---|
| `mqtt_username` | `""` | MQTT username |
| `mqtt_password` | `""` | MQTT password |
| `mqtt_discovery_prefix` | `homeassistant` | MQTT discovery prefix |
| `mqtt_state_topic` | `elco_remocon/heating/state` | Base state topic |
| `ha_device_name` | `ELCO Remocon.net Heating` | Device name in Home Assistant |
| `ha_device_id` | `elco_remocon_heating` | Device/unique ID prefix |
| `watch_interval_ms` | `300000` | Poll interval |
| `watch_error_backoff_ms` | `60000` | Retry delay on scrape error |
| `scrape_max_wait_ms` | `90000` | Max wait for dynamic data |
| `scrape_stable_passes` | `4` | Number of stable passes |
| `scrape_poll_delay_ms` | `2000` | Poll delay while stabilizing |
| `allowed_keys_csv` | curated key list | Comma-separated allow-list of metric keys to publish |

## Persistence

The add-on creates and reuses session/runtime state at:

- `/data/playwright/.auth/remotethermo.json`
- `/data/output/heating-metrics-YYYY-MM-DD.json`

## Notes

- The add-on publishes only keys listed in `allowed_keys_csv`.
- If session expires, auto-login is retried using configured credentials.
