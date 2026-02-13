# ELCO Remocon.net Heating MQTT Sync

Home Assistant add-on that runs the scraper inside Home Assistant and publishes MQTT discovery/state topics.

## Required add-on options

- `dashboard_url`
- `mqtt_url` (usually `mqtt://core-mosquitto:1883`)
- `mqtt_username` / `mqtt_password` if broker auth is enabled

## Login

Set:

- `login_username`
- `login_password`

The add-on will create and reuse session state at:

- `/data/playwright/.auth/remotethermo.json`

## Notes

- The add-on publishes only keys listed in `allowed_keys_csv`.
- If session expires, auto-login is retried using configured credentials.
