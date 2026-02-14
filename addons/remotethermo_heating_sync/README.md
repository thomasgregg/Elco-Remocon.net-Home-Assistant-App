# Elco-Remocon.net-Home-Assistant-App

Home Assistant add-on repository for ELCO Remocon.net heat pump telemetry.

The add-on logs into ELCO Remocon.net, reads heating values from your plant dashboard, and publishes them as MQTT Discovery entities so they are visible in Home Assistant automatically.

## Key Capabilities

- Reads data from ELCO Remocon.net dashboard pages that load dynamically
- Publishes retained MQTT Discovery configs
- Publishes retained MQTT state updates
- Publishes only changed values during watch cycles
- Supports strict metric allow-listing via `allowed_keys_csv`

## Repository Layout

- `repository.yaml`: repository metadata for Home Assistant Apps
- `addons/remotethermo_heating_sync`: add-on package

## Installation

1. Open `Settings -> Apps`.
2. Open app store repository management.
3. Add repository URL:
   - `https://github.com/thomasgregg/Elco-Remocon.net-Home-Assistant-App`
4. Install:
   - `ELCO Remocon.net Heating MQTT Sync`

## Home Assistant Example

The screenshot below shows a typical Home Assistant dashboard using entities published by this app.  
It combines status indicators, hot water temperatures, maintenance diagnostics, and heating-circuit setpoints in one view.

![ELCO Remocon.net in Home Assistant](https://raw.githubusercontent.com/thomasgregg/Elco-Remocon.net-Home-Assistant-App/main/docs/images/home-assistant-dashboard.png)

## Configuration

### Required

| Option | Description |
|---|---|
| `dashboard_url` | ELCO dashboard URL for your gateway. Format: `https://www.remocon-net.remotethermo.com/BsbPlantDashboard/Index/<gateway_id>` |
| `login_url` | ELCO login entry URL. Default: `https://www.remocon-net.remotethermo.com/R2/Account/Login` |
| `login_username` | ELCO account username/email |
| `login_password` | ELCO account password |
| `mqtt_url` | MQTT broker URL, usually `mqtt://core-mosquitto:1883` |

### Optional

| Option | Default | Description |
|---|---:|---|
| `mqtt_username` | `""` | MQTT username if broker auth is enabled |
| `mqtt_password` | `""` | MQTT password if broker auth is enabled |
| `mqtt_discovery_prefix` | `homeassistant` | Home Assistant MQTT discovery prefix |
| `mqtt_state_topic` | `elco_remocon/heating/state` | Base state topic prefix |
| `ha_device_name` | `ELCO Remocon.net Heating` | Device name in Home Assistant |
| `ha_device_id` | `elco_remocon_heating` | Unique ID/device prefix |
| `watch_interval_ms` | `300000` | Poll interval |
| `watch_error_backoff_ms` | `60000` | Retry delay on failure |
| `scrape_max_wait_ms` | `90000` | Max wait for dynamic dashboard data |
| `scrape_stable_passes` | `4` | Number of stable passes required |
| `scrape_poll_delay_ms` | `2000` | Poll delay while waiting for stable data |
| `allowed_keys_csv` | curated key list | Comma-separated allow-list for published metrics |

### How to find `<gateway_id>`

1. Log in to ELCO Remocon.net in your browser.
2. Open your plant dashboard.
3. Copy the last path segment of the URL after `/BsbPlantDashboard/Index/`.
4. Use it in `dashboard_url`, for example:
   - `https://www.remocon-net.remotethermo.com/BsbPlantDashboard/Index/F0AD4E0B7C60`

## Published Metrics

Default allow-list includes:

- `heating_active`
- `gateway_serial`
- `status`
- `location`
- `outside_temperature`
- `hot_water_current_temperature`
- `hot_water_comfort_temperature`
- `hot_water_reduced_temperature`
- `hot_water_operation_mode`
- `maintenance_code_1`
- `maintenance_code_2`
- `maintenance_priority_1`
- `maintenance_priority_2`
- `heating_circuit_700_operating_mode`
- `heating_circuit_710_comfort_setpoint`
- `heating_circuit_712_reduced_setpoint`
- `heating_circuit_714_frost_protection_setpoint`
- `heating_circuit_720_heating_curve_slope`
- `heating_circuit_730_summer_winter_heating_limit`

## Persistence

The add-on persists runtime data in `/data`:

- `/data/playwright/.auth/remotethermo.json`
- `/data/output/heating-metrics-YYYY-MM-DD.json`

## Operational Notes

- If dashboard sections are temporarily unavailable, core metrics still continue to publish.
- `No metric changes (19 tracked)` in logs is expected behavior.
- Restart during an active scrape can produce a browser-closed error once; this is not persistent failure.
