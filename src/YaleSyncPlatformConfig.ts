import {
	Decoder,
	object,
	string,
	number,
	oneOf,
	succeed,
} from 'type-safe-json-decoder'

export interface YaleSyncPlatformConfig {
	name: string
	username: string
	password: string
	refreshInterval: number // The number in seconds, values < 1 will disable refresh
}

export const platformConfigDecoder: Decoder<YaleSyncPlatformConfig> = object(
	['name', string()],
	['username', string()],
	['password', string()],
	['refreshInterval', number()],
	(name, username, password, refreshInterval) => ({
		name,
		username,
		password,
		refreshInterval,
	})
)
