# homebridge-yalesyncalarm - Homebridge support for Yale Sync Alarms

![npm](https://img.shields.io/npm/v/homebridge-yalesyncalarm)
[![Known Vulnerabilities](https://snyk.io//test/github/jonathandann/homebridge-yalesyncalarm/badge.svg?targetFile=package.json)](https://snyk.io//test/github/jonathandann/homebridge-yalesyncalarm/badge.svg?targetFile=package.json)
[![npm](https://img.shields.io/npm/l/blink.svg 'license')](https://github.com/jonathandann/homebridge-yalesyncalarm/blob/master/LICENSE)

Homebridge plugin for the [Yale Sync Smart Home Alarm](https://www.yale.co.uk/en/yale/couk/products/smart-living/smart-home-alarms/sync-smart-alarm/) and [Yale Smart Home Alarm](https://www.yale.co.uk/en/yale/couk/products/smart-living/smart-home-alarms/smart-home-alarm-starter-kit/).

# Features

- Exposes the alarm system as a Home.app secuirty system. You can set it to "Home", "Away", "Night" and "Off" modes. Yale alarms only have 3 modes. So both "Home" and "Night" will "part-arm" the system.
- Contact and motion sensors are exposed in Home.app

# Please Note

There's currently no way to hook into Yale's push service. It's not possible to get truly realtime updates.

The `refreshInterval` parameter in config.json is experimental. It causes the plugin to call the Yale API every `refreshInterval` seconds to get the current state of the alarm and sensors.

If you set `refreshInterval` to a value less than `1`. The automatic update is disabled. In this case switching away from, and back to Home.app will refresh the state of the system in Home.app.

# Installation

`npm install -g homebridge-blink`

## Configuration

```json
"platforms": [
    {
        "platform": "YaleSyncAlarm",
        "name": "Burglar Alarm",
        "username": "username@mail.com",
        "password": "password",
        "refreshInterval": 10
    }
]
```

# Building from Source

```bash
git clone https://github.com/jonathandann/homebridge-yalesyncalarm.git && cd homebridge-yalesyncalarm && npm install
```

After running `npm install`, `npm` should automatically run `npm run build`, which runs `node_modules/typescript/bin/tsc` to compile the typescript files. If it doesn't then you can run either `node_modules/typescript/bin/tsc` or `npm run build`.

There are useful configs already included for [prettier](https://prettier.io) and [Visual Studio Code](https://code.visualstudio.com).

Visual Studio Code is configured to use the version of typescript installed as a development dependency in the npm package.
