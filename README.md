# Elco-Remocon.net-Home-Assistant-App

Home Assistant add-on repository for scraping ELCO Remocon.net heating data and publishing MQTT discovery/state entities.

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

## Persistence

The add-on persists state in:

- `/data/playwright/.auth/remotethermo.json`
- `/data/output/heating-metrics-YYYY-MM-DD.json`
