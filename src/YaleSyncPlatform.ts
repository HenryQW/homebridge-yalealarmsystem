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

import * as Yale from 'yalesyncalarm'
import {
	Service as HAPService,
	Categories as HAPAccessoryCategory,
	Characteristic as HAPCharacteristic,
	uuid,
	CharacteristicEventTypes as HAPCharacteristicEventTypes,
	CharacteristicValue,
	CharacteristicGetCallback,
	CharacteristicSetCallback,
	Nullable,
} from 'hap-nodejs'
import { YaleSyncPlatformConfig } from './YaleSyncPlatformConfig'
import {
	SecuritySystem,
	AccessoryInformation,
} from 'hap-nodejs/dist/lib/gen/HomeKit'

// All of these are redeclared, and then reassigned below so we can elide the require('hap-nodejs').
// This means hap-nodejs can just be a development dependency and we can reduce the package size.
// Typescript 3.8 allows for import type {}, but we don't use that yet.
let Service: typeof HAPService
let Characteristic: typeof HAPCharacteristic
let UUIDGenerator: typeof uuid
let CharacteristicEventTypes: typeof HAPCharacteristicEventTypes
let Categories: typeof HAPAccessoryCategory

let PlatformAccessory: any

let pluginName = 'homebridge-yalesyncalarm'
let platformName = 'YaleSync'

export default function(homebridge: any) {
	Service = homebridge.hap.Service
	Characteristic = homebridge.hap.Characteristic
	UUIDGenerator = homebridge.hap.uuid
	CharacteristicEventTypes = homebridge.hap.CharacteristicEventTypes
	Categories = homebridge.hap.Categories

	PlatformAccessory = homebridge.platformAccessory

	homebridge.registerPlatform(
		pluginName,
		platformName,
		YaleSyncPlatform, // constructor
		true // dynamic
	)
}

// TODO: Handle ".ALARM_TRIGGERED"
function modeToCurrentState(mode: Yale.Panel.Mode) {
	switch (mode) {
		case Yale.Panel.Mode.arm:
			return Characteristic.SecuritySystemCurrentState.AWAY_ARM
		case Yale.Panel.Mode.disarm:
			return Characteristic.SecuritySystemCurrentState.DISARMED
		case Yale.Panel.Mode.home:
			// HomeKit also exposes STAY_ARM. Yale doesn't distinguish between the concepts of "STAY_ARM" and "NIGHT_ARM"
			// So we just arbitrarily always choose to map "home" <-> NIGHT_ARM.
			return Characteristic.SecuritySystemCurrentState.NIGHT_ARM
	}
}

function targetStateToMode(targetState: CharacteristicValue): Yale.Panel.Mode {
	if (targetState === Characteristic.SecuritySystemTargetState.AWAY_ARM) {
		return Yale.Panel.Mode.arm
	} else if (targetState === Characteristic.SecuritySystemTargetState.DISARM) {
		return Yale.Panel.Mode.disarm
	} else {
		// .STAY_ARM || .NIGHT_ARM
		return Yale.Panel.Mode.home
	}
}

class YaleSyncPlatform {
	// Passed in via constructor
	log: any
	api: any

	//yale: Yale
	accessories: { [key: string]: any } = {}

	username: string
	password: string
	alarmName: string

	constructor(log: any, config: YaleSyncPlatformConfig, api: any) {
		//		this.yale = new Yale(config.username, config.password)
		// TODO: assert config has correct values.
		this.username = config.username
		this.password = config.password
		this.alarmName = config.alarmName
		this.log = log
		this.api = api
		this.api.on('didFinishLaunching', async () => {
			await this.onDidFinishLaunching()
		})
	}

	// Called when homebridge has finished loading cached accessories.
	// We need to register new ones and unregister ones that are no longer reachable.
	async onDidFinishLaunching() {
		this.log('Searching for devices')
		//		await this.yale.update()
		const uuid = UUIDGenerator.generate(
			`${pluginName}.${platformName}.panel.${this.username}`
		)
		if (this.accessories[uuid] === undefined) {
			const accessory = new PlatformAccessory(
				this.alarmName,
				uuid,
				Categories.SECURITY_SYSTEM
			)
			accessory.context.identifier = this.username
			this.configurePanel(accessory)
			this.log(`Registering alarm panel: ${this.alarmName}`)
			this.api.registerPlatformAccessories(pluginName, platformName, [
				accessory,
			])
		}
	}

	// Called when homebridge restores a cached accessory.
	configureAccessory(accessory: any) {
		if (this.accessories[accessory.UUID] === undefined) {
			if (accessory.context.identifier == this.username) {
				this.configurePanel(accessory)
			}
		}
	}

	configurePanel(accessory: any) {
		if (this.accessories[accessory.UUID] === undefined) {
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
					CharacteristicEventTypes.GET,
					async (
						callback: CharacteristicGetCallback<Nullable<CharacteristicValue>>,
						context?: any,
						connectionID?: string | undefined
					) => {
						// TODO: catch errors
						// TODO: remove duplication in target state getter
						// TODO: logging
						const accessToken = await Yale.authenticate(
							this.username,
							this.password
						)
						const mode = await Yale.Panel.getMode(accessToken)
						callback(null, modeToCurrentState(mode))
					}
				)

			securitySystem
				.getCharacteristic(Characteristic.SecuritySystemTargetState)
				?.on(
					CharacteristicEventTypes.GET,
					async (
						callback: CharacteristicGetCallback<Nullable<CharacteristicValue>>,
						context?: any,
						connectionID?: string | undefined
					) => {
						// TODO: catch errors
						// TODO: remove duplication in target state getter
						// TODO: logging
						const accessToken = await Yale.authenticate(
							this.username,
							this.password
						)
						const mode = await Yale.Panel.getMode(accessToken)
						callback(null, modeToCurrentState(mode))
					}
				)
				?.on(
					CharacteristicEventTypes.SET,
					async (
						targetState: CharacteristicValue,
						callback: CharacteristicSetCallback,
						context?: any,
						connectionID?: string | undefined
					) => {
						const accessToken = await Yale.authenticate(
							this.username,
							this.password
						)
						const currentMode = await Yale.Panel.setMode(
							accessToken,
							targetStateToMode(targetState)
						)
						const mode = await Yale.Panel.getMode(accessToken)
						securitySystem.setCharacteristic(
							Characteristic.SecuritySystemCurrentState,
							modeToCurrentState(mode)
						)
						callback(null)
						// TODO: logging
						// TODO: error handling
					}
				)
			accessory.updateReachability(true)
		}
	}
}
