var Service, Characteristic;
const { getAccessToken, getStatus, setStatus } = require('yalealarmsystem');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-yalealarmsystem", "YaleAlarm", YaleAlarm);
}

function YaleAlarm(log, config) {
    this.log = log;
    this.name = config["name"];
    this.config = config;

    this.service = new Service.SecuritySystem(this.name);
    this.service
    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
    .on('get', this.getCurrentState.bind(this));

    this.service
    .getCharacteristic(Characteristic.SecuritySystemTargetState)
    .on('get', this.getTargetState.bind(this))
    .on('set', this.setTargetState.bind(this));

    this.informationService = new Service.AccessoryInformation();

    this.informationService
    .setCharacteristic(Characteristic.Manufacturer, "Yale")
    .setCharacteristic(Characteristic.Model, "Yale IA-320");
}

YaleAlarm.prototype.getCurrentState = function(callback) {
    this.log("getCurrentState()");
    // callback(null, Characteristic.SecuritySystemCurrentState.DISARMED)
    getAccessToken(
        this.config.username, 
        this.config.password
    ).then(getStatus).then((response) => {
        this.log(`Yale Response: getCurrentState() ${response}`);
        var currentState;
        if (response === "arm") {
            this.log("Reporting current state as .AWAY_ARM");
            currentState = Characteristic.SecuritySystemCurrentState.AWAY_ARM;
        } else if (response === "disarm") {
            this.log("Reporting current state as .DISARMED");
            currentState = Characteristic.SecuritySystemCurrentState.DISARMED
        } else { // "home"
            this.log("Reporting current state as .NIGHT_ARM");
            // HomeKit also exposes STAY_ARM. Yale doesn't distinguish between the concepts of "STAY_ARM" and "NIGHT_ARM"
            // So we just arbitrarily always choose to map "home" <-> NIGHT_ARM.
            currentState = Characteristic.SecuritySystemCurrentState.NIGHT_ARM 
        }
        callback(null, currentState);
    }).catch(this.log);
}

YaleAlarm.prototype.getTargetState = function(callback) {
    this.log("getTargetState()");
    getAccessToken(
        this.config.username, 
        this.config.password
    ).then(getStatus).then((response) => {
        this.log(`Yale Response: getCurrentState() ${response}`);
        var currentState;
        if (response === "arm") {
            this.log("Reporting target state as .AWAY_ARM");
            currentState = Characteristic.SecuritySystemTargetState.AWAY_ARM;
        } else if (response === "disarm") {
            this.log("Reporting target state as .DISARM");
            currentState = Characteristic.SecuritySystemTargetState.DISARM
        } else { // "home"
            this.log("Reporting target state as .NIGHT_ARM");
            // HomeKit also exposes STAY_ARM. Yale doesn't distinguish between the concepts of "STAY_ARM" and "NIGHT_ARM"
            // So we just arbitrarily always choose to map "home" <-> NIGHT_ARM.
            currentState = Characteristic.SecuritySystemTargetState.NIGHT_ARM 
        }
        callback(null, currentState);
    }).catch(this.log);
}

YaleAlarm.prototype.setTargetState = function(targetState, callback) {
    var alarmState;
    if (targetState === Characteristic.SecuritySystemTargetState.AWAY_ARM) {
        alarmState = "arm";
    } else if (targetState === Characteristic.SecuritySystemTargetState.DISARM) {
        alarmState = "disarm";
    } else { // .STAY_ARM || .NIGHT_ARM
        alarmState = "home";
    }
    this.log(`Set Alarm state to ${alarmState}`);

    getAccessToken(
        this.config.username, 
        this.config.password
    ).then((accessToken) => {
        setStatus(accessToken, alarmState).then((response) => { 
            this.log(`Yale Response setState() ${response}`);
            var currentState;
            if (response === "OK") {
                var currentState;
                if (targetState === Characteristic.SecuritySystemTargetState.STAY_ARM) {
                    currentState = Characteristic.SecuritySystemCurrentState.STAY_ARM;
                } else if (targetState == Characteristic.SecuritySystemTargetState.AWAY_ARM) {
                    currentState = Characteristic.SecuritySystemCurrentState.AWAY_ARM;
                } else if (targetState == Characteristic.SecuritySystemTargetState.NIGHT_ARM) {
                    currentState = Characteristic.SecuritySystemCurrentState.NIGHT_ARM;
                } else if (targetState == Characteristic.SecuritySystemTargetState.DISARM) {
                    currentState = Characteristic.SecuritySystemCurrentState.DISARMED;
                }
                this.service.setCharacteristic(Characteristic.SecuritySystemCurrentState, currentState);
                callback(null); // success
            }
        }).catch((response) => {
            this.log('catch')
            this.log(response)
        });
    });
}

YaleAlarm.prototype.getServices = function() {
    return [this.service, this.informationService];
}