/*!
    MIT License

    https://github.com/jonathandann/homebridge-yalesyncalarm
    Copyright (c) 2019 Jonathan Dann

		Forked from https://github.com/jonathan-fielding/yalealarmsystem
    Copyright 2019 Jonathan Fielding, Jack Mellor & Adam Green

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

import { Yale } from 'yalesyncalarm'
import {
	Service as HAPService,
	Categories as HAPAccessoryCategory,
	Characteristic as HAPCharacteristic,
	uuid,
	CharacteristicValue,
	CharacteristicGetCallback,
	CharacteristicSetCallback,
	Nullable,
} from 'hap-nodejs'
import { platformConfigDecoder } from './YaleSyncPlatformConfig'
import {
	ContactSensor as HAPContactSensor,
	MotionSensor as HAPMotionSensor,
	SecuritySystem,
	AccessoryInformation,
	ContactSensorState,
} from 'hap-nodejs/dist/lib/gen/HomeKit'
import { Logger, LogLevel } from 'yalesyncalarm/dist/Logger'
import { ContactSensor, MotionSensor, Panel } from 'yalesyncalarm/dist/Model'

// All of these are redeclared, and then reassigned below so we can elide the require('hap-nodejs').
// This means hap-nodejs can just be a development dependency and we can reduce the package size.
// Typescript 3.8 allows for import type {}, but we don't use that yet.
let Service: typeof HAPService
let Characteristic: typeof HAPCharacteristic
let UUIDGenerator: typeof uuid
let Categories: typeof HAPAccessoryCategory

let PlatformAccessory: any

let pluginName = 'homebridge-yalesyncalarm'
let platformName = 'YaleSync'

export default function(homebridge: any) {
	Service = homebridge.hap.Service
	Characteristic = homebridge.hap.Characteristic
	UUIDGenerator = homebridge.hap.uuid
	Categories = homebridge.hap.Accessory.Categories

	PlatformAccessory = homebridge.platformAccessory

	homebridge.registerPlatform(
		pluginName,
		platformName,
		YaleSyncPlatform, // constructor
		true // dynamic
	)
}

function modeToCurrentState(mode: Panel.State) {
	switch (mode) {
		case Panel.State.Armed:
			return Characteristic.SecuritySystemCurrentState.AWAY_ARM
		case Panel.State.Disarmed:
			return Characteristic.SecuritySystemCurrentState.DISARMED
		case Panel.State.Home:
			// HomeKit also exposes STAY_ARM. Yale doesn't distinguish between the concepts of "STAY_ARM" and "NIGHT_ARM"
			// So we just arbitrarily always choose to map "home" <> NIGHT_ARM.
			return Characteristic.SecuritySystemCurrentState.NIGHT_ARM
	}
}

function targetStateToMode(targetState: CharacteristicValue): Panel.State {
	if (targetState === Characteristic.SecuritySystemTargetState.AWAY_ARM) {
		return Panel.State.Armed
	} else if (targetState === Characteristic.SecuritySystemTargetState.DISARM) {
		return Panel.State.Disarmed
	} else {
		// .STAY_ARM || .NIGHT_ARM
		return Panel.State.Home
	}
}

class YaleSyncPlatform {
	private _yale?: Yale
	private _accessories: { [key: string]: any } = {}

	constructor(
		private readonly _log: any,
		config: any,
		private readonly _api: any
	) {
		// Validate the config, if we're not correctly configured, the rest of the plugin
		// fails gracefully instead of crashing homebridge.
		try {
			const platformConfig = platformConfigDecoder.decodeAny(config)
			this._yale = new Yale(
				platformConfig.username,
				platformConfig.password,
				new Logger(LogLevel.Info | LogLevel.Error, this._log)
			)
			this._api.on('didFinishLaunching', async () => {
				await this.onDidFinishLaunching()
			})
		} catch (error) {
			this._log((error as Error).message)
		}
	}

	// Called when homebridge has finished loading cached accessories.
	// We need to register new ones and unregister ones that are no longer reachable.
	async onDidFinishLaunching() {
		if (this._yale === undefined) {
			// Incorrectly configured plugin.
			return
		}
		this._log('Searching for devices')
		await this._yale.update()

		const panel = await this._yale.panel()
		if (panel !== undefined) {
			this._log(`Discovered panel: ${panel.identifier}`)
			const uuid = UUIDGenerator.generate(
				`${pluginName}.${platformName}.panel.${panel.identifier}`
			)
			if (this._accessories[uuid] === undefined) {
				const accessory = new PlatformAccessory(
					'Alarm System',
					uuid,
					Categories.SECURITY_SYSTEM
				)
				accessory.context.identifier = panel.identifier
				accessory.context.kind = 'panel'
				this.configurePanel(accessory)
				this._log(`Registering alarm panel: ${panel.identifier}`)
				this._api.registerPlatformAccessories(pluginName, platformName, [
					accessory,
				])
			} else {
				this._log(
					`Panel: ${panel.identifier} already registered with Homebridge`
				)
			}
		}

		const motionSensors = await this._yale.motionSensors()
		for (let [identifier, motionSensor] of Object.entries(motionSensors)) {
			this._log(`Discovered moton sensor: ${motionSensor.name}`)
			const uuid = UUIDGenerator.generate(
				`${pluginName}.${platformName}.motionSensor.${identifier}`
			)
			if (this._accessories[uuid] === undefined) {
				const accessory = new PlatformAccessory(
					motionSensor.name,
					uuid,
					Categories.SENSOR
				)
				accessory.context.identifier = identifier
				accessory.context.kind = 'motionSensor'
				this.configureMotionSensor(accessory)
				this._log(
					`Registering motion sensor: ${motionSensor.name} ${motionSensor.identifier}`
				)
				this._api.registerPlatformAccessories(pluginName, platformName, [
					accessory,
				])
			} else {
				this._log(
					`Motion sensor: ${motionSensor.name} ${motionSensor.identifier} already registered with Homebridge`
				)
			}
		}

		const contactSensors = await this._yale.contactSensors()
		for (let [identifier, contactSensor] of Object.entries(contactSensors)) {
			this._log(`Discovered moton sensor: ${contactSensor.name}`)
			const uuid = UUIDGenerator.generate(
				`${pluginName}.${platformName}.contactSensor.${identifier}`
			)
			if (this._accessories[uuid] === undefined) {
				const accessory = new PlatformAccessory(
					contactSensor.name,
					uuid,
					Categories.SENSOR
				)
				accessory.context.identifier = identifier
				accessory.context.kind = 'contactSensor'
				this.configureContactSensor(accessory)
				this._log(
					`Registering contact sensor: ${contactSensor.name} ${contactSensor.identifier}`
				)
				this._api.registerPlatformAccessories(pluginName, platformName, [
					accessory,
				])
			} else {
				this._log(
					`Contact sensor: ${contactSensor.name} ${contactSensor.identifier} already registered with Homebridge`
				)
			}
		}
	}

	// Called when homebridge restores a cached accessory.
	configureAccessory(accessory: any) {
		if (this._yale === undefined) {
			// Incorrectly configured plugin.
			return
		}
		if (this._accessories[accessory.UUID] === undefined) {
			if (accessory.context.kind === 'panel') {
				this.configurePanel(accessory)
			} else if (accessory.context.kind === 'motionSensor') {
				this.configureMotionSensor(accessory)
			} else if (accessory.context.kind === 'contactSensor') {
				this.configureContactSensor(accessory)
			}
		}
	}

	configureMotionSensor(accessory: any) {
		if (this._yale === undefined) {
			// Incorrectly configured plugin.
			return
		}
		if (this._accessories[accessory.UUID] === undefined) {
			// Homebridge adds this service by default to all instances of PlatformAccessory
			const informationService: AccessoryInformation = accessory.getService(
				Service.AccessoryInformation
			)
			informationService
				.setCharacteristic(Characteristic.Name, accessory.displayName)
				.setCharacteristic(Characteristic.Manufacturer, 'Yale')
				.setCharacteristic(Characteristic.Model, 'Motion Sensor')
				.setCharacteristic(
					Characteristic.SerialNumber,
					accessory.context.identifier
				)
			const contactSensor: HAPMotionSensor =
				accessory.getService(Service.MotionSensor) !== undefined
					? accessory.getService(Service.MotionSensor)
					: accessory.addService(Service.MotionSensor)
			contactSensor
				.getCharacteristic(Characteristic.MotionDetected)
				?.on(
					'get' as any,
					async (
						callback: CharacteristicGetCallback<Nullable<CharacteristicValue>>,
						context?: any,
						connectionID?: string | undefined
					) => {
						if (this._yale === undefined) {
							callback(new Error(`${pluginName} incorrectly configured`))
							return
						}
						const motionSensors = await this._yale.motionSensors()
						const motionSensor = motionSensors[accessory.context.identifier]
						if (motionSensor !== undefined) {
							const updated = await this._yale?.updateMotionSensor(motionSensor)
							if (updated !== undefined) {
								callback(
									null,
									updated.state == MotionSensor.State.Triggered ? true : false
								)
							} else {
								callback(
									new Error(
										`Failed to get status of motion sensor: ${motionSensor.name} ${motionSensor.identifier}`
									)
								)
							}
						} else {
							callback(
								new Error(
									`Motion sensor: ${accessory.context.identifier} not found`
								)
							)
						}
					}
				)
		}
	}

	configureContactSensor(accessory: any) {
		if (this._yale === undefined) {
			// Incorrectly configured plugin.
			return
		}
		if (this._accessories[accessory.UUID] === undefined) {
			// Homebridge adds this service by default to all instances of PlatformAccessory
			const informationService: AccessoryInformation = accessory.getService(
				Service.AccessoryInformation
			)
			informationService
				.setCharacteristic(Characteristic.Name, accessory.displayName)
				.setCharacteristic(Characteristic.Manufacturer, 'Yale')
				.setCharacteristic(Characteristic.Model, 'Contact Sensor')
				.setCharacteristic(
					Characteristic.SerialNumber,
					accessory.context.identifier
				)
			const contactSensor: HAPContactSensor =
				accessory.getService(Service.ContactSensor) !== undefined
					? accessory.getService(Service.ContactSensor)
					: accessory.addService(Service.ContactSensor)
			contactSensor
				.getCharacteristic(Characteristic.ContactSensorState)
				?.on(
					'get' as any,
					async (
						callback: CharacteristicGetCallback<Nullable<CharacteristicValue>>,
						context?: any,
						connectionID?: string | undefined
					) => {
						if (this._yale === undefined) {
							callback(new Error(`${pluginName} incorrectly configured`))
							return
						}
						const contactSensors = await this._yale.contactSensors()
						const contactSensor = contactSensors[accessory.context.identifier]
						if (contactSensor !== undefined) {
							const updated = await this._yale?.updateContactSensor(
								contactSensor
							)
							if (updated !== undefined) {
								callback(
									null,
									updated.state == ContactSensor.State.Closed
										? ContactSensorState.CONTACT_DETECTED
										: ContactSensorState.CONTACT_NOT_DETECTED
								)
							} else {
								callback(
									new Error(
										`Failed to get status of contact sensor: ${contactSensor.name} ${contactSensor.identifier}`
									)
								)
							}
						} else {
							callback(
								new Error(
									`Contact sensor: ${accessory.context.identifier} not found`
								)
							)
						}
					}
				)
		}
	}

	configurePanel(accessory: any) {
		if (this._yale === undefined) {
			// Incorrectly configured plugin.
			return
		}
		if (this._accessories[accessory.UUID] === undefined) {
			// Homebridge adds this service by default to all instances of PlatformAccessory
			const informationService: AccessoryInformation = accessory.getService(
				Service.AccessoryInformation
			)
			informationService
				.setCharacteristic(Characteristic.Name, accessory.displayName)
				.setCharacteristic(Characteristic.Manufacturer, 'Yale')
				.setCharacteristic(Characteristic.Model, 'Yale IA-320')
				.setCharacteristic(
					Characteristic.SerialNumber,
					accessory.context.identifier
				)

			const securitySystem: SecuritySystem =
				accessory.getService(Service.SecuritySystem) !== undefined
					? accessory.getService(Service.SecuritySystem)
					: accessory.addService(Service.SecuritySystem)
			securitySystem
				.getCharacteristic(Characteristic.SecuritySystemCurrentState)
				?.on(
					'get' as any,
					async (
						callback: CharacteristicGetCallback<Nullable<CharacteristicValue>>,
						context?: any,
						connectionID?: string | undefined
					) => {
						if (this._yale === undefined) {
							// Incorrectly configured plugin.
							callback(new Error(`${pluginName} incorrectly configured`))
							return
						}
						let panelState = await this._yale.getPanelState()
						callback(null, modeToCurrentState(panelState))
					}
				)

			securitySystem
				.getCharacteristic(Characteristic.SecuritySystemTargetState)
				?.on(
					'get' as any,
					async (
						callback: CharacteristicGetCallback<Nullable<CharacteristicValue>>,
						context?: any,
						connectionID?: string | undefined
					) => {
						if (this._yale === undefined) {
							// Incorrectly configured plugin.
							callback(new Error(`${pluginName} incorrectly configured`))
							return
						}
						let panelState = await this._yale.getPanelState()
						callback(null, modeToCurrentState(panelState))
					}
				)
				?.on(
					'set' as any,
					async (
						targetState: CharacteristicValue,
						callback: CharacteristicSetCallback,
						context?: any,
						connectionID?: string | undefined
					) => {
						if (this._yale === undefined) {
							// Incorrectly configured plugin.
							callback(new Error(`${pluginName} incorrectly configured`))
							return
						}
						const mode = await this._yale.setPanelState(
							targetStateToMode(targetState)
						)
						securitySystem.setCharacteristic(
							Characteristic.SecuritySystemCurrentState,
							modeToCurrentState(mode)
						)
						callback(null)
					}
				)
			accessory.updateReachability(true)
			this._accessories[accessory.UUID] = accessory
		}
	}
}
