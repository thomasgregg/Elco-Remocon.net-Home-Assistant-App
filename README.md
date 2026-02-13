# RemoteThermo -> Home Assistant Sync

Playwright scraper for the RemoteThermo dashboard, with MQTT discovery/state publishing into Home Assistant.

## Install

```bash
cd "/Users/thomas.gregg/Documents/New project"
npm install
cp .env.example .env
```

## Configure

Set in `.env`:

- `HEATING_DASHBOARD_URL`
- `MQTT_URL`
- `MQTT_USERNAME` / `MQTT_PASSWORD` (if broker auth is enabled)

Optional filter controls:

- `HEATING_INCLUDE_REGEX`
- `HEATING_EXCLUDE_REGEX`

## Login Session Setup

The website login is captured via browser session cookies.

Interactive login capture:

```bash
npm run setup:heating:login
```

If SSO/captcha is easier in your regular Chrome profile:

```bash
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-codex
npm run setup:heating:session
```

Session state is saved to:

- `playwright/.auth/remotethermo.json`

## Run Once

```bash
npm run sync:heating
```

This will:

- scrape dashboard metrics after waiting for dynamic data
- write `output/heating-metrics-YYYY-MM-DD.json`
- publish MQTT discovery under `homeassistant/sensor/.../config`
- publish metric states under `MQTT_STATE_TOPIC/<metric_key>`

## Continuous Watch (Changed Values Only)

```bash
npm run watch:heating
```

Watch behavior:

- polls every `WATCH_INTERVAL_MS` (default 5 min)
- publishes only changed metrics
- stores last published values in `output/heating-last-published-state.json`
- on errors, retries after `WATCH_ERROR_BACKOFF_MS`

## Home Assistant Add-on (No External Server)

This repository now includes a Home Assistant add-on package at:

- `addons/remotethermo_heating_sync`

Repository metadata for HA is in:

- `repository.yaml`

### Add to Home Assistant

1. In Home Assistant, open `Settings -> Add-ons -> Add-on Store -> Repositories`.
2. Add your Git repository URL for this project.
3. Install `RemoteThermo Heating MQTT Sync`.

### Required Add-on Options

- `dashboard_url`
- `login_username`
- `login_password`
- `mqtt_url` (usually `mqtt://core-mosquitto:1883`)
- `mqtt_username` / `mqtt_password` if broker auth is enabled

The add-on persists session state in `/data/playwright/.auth/remotethermo.json` and publishes only the whitelisted keys from `allowed_keys_csv`.
