// ASUS TUF RX 9070 XT Gaming OC — SignalRGB controller.
// Based solely on Asus_AMD_GPU.js. SMBus writes are restricted to the verified
// ASUS 0x7550 / 0x0613 ENE controller and stop after any write/read-back failure.

export function Name() { return "ASUS TUF Radeon RX 9070 XT Gaming OC"; }
export function Version() { return "1.0.0-verified"; }
export function Publisher() { return "gpu-light / verified derivative"; }
export function Documentation() { return "troubleshooting/asus"; }
export function Type() { return "SMBUS"; }
export function Size() { return [4, 1]; }
export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }
export function DeviceType() { return "gpu"; }
export function ImageUrl() { return "https://assets.signalrgb.com/devices/default/gpu.png"; }
export function ConflictingProcesses() { return ["LightingService.exe", "OpenRGB.exe"]; }

/* global bus device LightingMode:readonly forcedColor:readonly */
export function ControllableParameters() {
	return [
		{ property: "LightingMode", group: "lighting", label: "Lighting Mode", description: "Canvas follows the active SignalRGB effect. Forced uses the selected fixed color.", type: "combobox", values: ["Canvas", "Forced"], default: "Canvas" },
		{ property: "forcedColor", group: "lighting", label: "Forced Color", description: "Used only when Lighting Mode is Forced.", min: "0", max: "360", type: "color", default: "#009bde" },
	];
}

const ENE_I2C_ADDR = 0x67;
const EXPECTED_VENDOR = 0x1043;
const EXPECTED_PRODUCT = 0x7550;
const EXPECTED_SUBDEVICE = 0x0613;
const LED_COUNT = 4;
const LOG_TAG = "[AsusTufRx9070Xt]";
const REG = { deviceName: 0x1000, direct: 0x8020, mode: 0x8021, speed: 0x8022, direction: 0x8023, apply: 0x80a0, colorsDirect: 0x8100 };

let vLedNames = [];
/** @type {LedPosition[]} */
let vLedPositions = [];
const oldColors = [];
let active = false;
let firstColorVerified = false;
let lastLightingMode = null;
let savedState = null;

function log(message) { console.log(`${LOG_TAG} ${message}`); }
function hex(value) { return `0x${value.toString(16)}`; }
function isExpectedGpu() {
	return bus.IsAMDGpuBus() && bus.SubVendor() === EXPECTED_VENDOR && bus.Product() === EXPECTED_PRODUCT && bus.SubDevice() === EXPECTED_SUBDEVICE;
}

/** @param {FreeAddressBus} scanBus */
export function Scan(scanBus) {
	const amd = scanBus.IsAMDGpuBus();
	const subVendor = scanBus.SubVendor();
	const product = scanBus.Product();
	const subDevice = scanBus.SubDevice();
	scanBus.log(`${LOG_TAG} Scan: IsAMD=${amd} SubVendor=${hex(subVendor)} Product=${hex(product)} SubDevice=${hex(subDevice)} Name="${scanBus.Name()}"`, { toFile: true });
	if (!amd || subVendor !== EXPECTED_VENDOR || product !== EXPECTED_PRODUCT || subDevice !== EXPECTED_SUBDEVICE) {
		scanBus.log(`${LOG_TAG} Scan skip: only ASUS 0x7550 / 0x0613 is accepted.`, { toFile: true });
		return [];
	}
	scanBus.log(`${LOG_TAG} Scan HIT: ASUS TUF Radeon RX 9070 XT Gaming OC @0x67`, { toFile: true });
	return [ENE_I2C_ADDR];
}

export function Initialize() {
	active = false;
	firstColorVerified = false;
	lastLightingMode = null;
	savedState = null;
	oldColors.length = 0;
	try {
		log(`Initialize: Vendor=${hex(bus.Vendor())} SubVendor=${hex(bus.SubVendor())} Product=${hex(bus.Product())} SubDevice=${hex(bus.SubDevice())} Bus="${bus.Name()}"`);
		if (!isExpectedGpu()) { log("ABORT: PCI/ASUS identity check failed. No controller write performed."); return; }

		const health = Ene.probeHealth();
		log(`probeHealth: ${JSON.stringify(health)}`);
		if (!health.sigOk || !health.state) { log("ABORT: ENE signature/state check failed. No controller write performed."); return; }

		savedState = health.state;
		device.setName("ASUS TUF Radeon RX 9070 XT Gaming OC");
		setupLeds();
		if (!Ene.setDirectMode(true)) { failAndRestore("could not enable Direct Mode"); return; }
		lastLightingMode = LightingMode;
		active = true;
		log(`PASS: verified controller; saved hardware state=${JSON.stringify(savedState)}. RGB control enabled.`);
		sendColors(true);
	} catch (error) {
		log(`Initialize EXCEPTION: ${error && error.stack ? error.stack : error}`);
		failAndRestore("initialization exception");
	}
}

export function Render() {
	if (!active) return;
	try { sendColors(false); }
	catch (error) { log(`Render EXCEPTION: ${error && error.stack ? error.stack : error}`); failAndRestore("render exception"); }
}

export function Shutdown(SystemSuspending) {
	log(`Shutdown: SystemSuspending=${SystemSuspending}`);
	if (savedState) restoreSavedState("shutdown");
	active = false;
}

function setupLeds() {
	vLedNames = [];
	vLedPositions = [];
	for (let index = 0; index < LED_COUNT; index++) {
		vLedNames.push(`LED ${index + 1}`);
		vLedPositions.push([index, 0]);
		oldColors[index] = null;
	}
	device.setControllableLeds(vLedNames, vLedPositions);
	device.setSize([LED_COUNT, 1]);
}

function colorsEqual(first, second) {
	return !!first && !!second && first.length === second.length && first.every((value, index) => value === second[index]);
}

function hexToRgb(color) {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color || "");
	return match ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)] : [0, 0, 0];
}

function getLedColor(x, y) {
	if (LightingMode === "Forced") return hexToRgb(forcedColor);
	const color = device.color(x, y);
	return color && color.length >= 3 ? [color[0] & 0xff, color[1] & 0xff, color[2] & 0xff] : [0, 0, 0];
}

function sendColors(force) {
	if (!active) return;
	if (lastLightingMode !== LightingMode) {
		lastLightingMode = LightingMode;
		force = true;
		for (let index = 0; index < LED_COUNT; index++) oldColors[index] = null;
		if (!Ene.setDirectMode(true)) { failAndRestore("Direct Mode refresh failed"); return; }
	}

	const data = [];
	const dirty = [];
	for (let index = 0; index < LED_COUNT; index++) {
		const position = vLedPositions[index];
		const color = getLedColor(position[0], position[1]);
		if (force || !colorsEqual(oldColors[index], color)) {
			dirty.push(index);
			oldColors[index] = color;
		}
		// ENE wire order from the verified original plugin: R, B, G.
		data.push(color[0], color[2], color[1]);
	}
	if (dirty.length === 0) return;

	// Do not push a blank canvas during startup before an effect is ready.
	if (force && dirty.length === LED_COUNT && data.every((byte) => byte === 0)) {
		log("Initial color packet skipped: canvas is all black/not ready.");
		for (let index = 0; index < LED_COUNT; index++) oldColors[index] = null;
		return;
	}

	log(`Writing ${dirty.length} changed LED(s); mode=${LightingMode}.`);
	if (!Ene.writeDirectColors(data, dirty)) { failAndRestore("RGB write failed"); return; }
	if (!firstColorVerified) {
		if (!Ene.verifyFirstColor(data.slice(0, 3))) { failAndRestore("first RGB read-back verification failed"); return; }
		firstColorVerified = true;
		log("PASS: first RGB write read-back verified.");
	}
}

function failAndRestore(reason) {
	log(`FAIL: ${reason}. Stopping further RGB updates.`);
	active = false;
	if (savedState) restoreSavedState("failure cleanup");
}

function restoreSavedState(reason) {
	log(`Restoring saved hardware state (${reason}): ${JSON.stringify(savedState)}`);
	const ok = Ene.restoreState(savedState);
	log(`Restore ${ok ? "PASS" : "FAIL"}.`);
	return ok;
}

const Ene = {
	adlxWrite(bytes, label) {
		const code = bus.WriteBlock(0, bytes.length, bytes);
		const ok = code === 0;
		log(`${label} -> code=${code}${ok ? " OK" : " FAIL"}`);
		return ok;
	},
	selectRegister(register) { return this.adlxWrite([0x00, (register >> 8) & 0xff, register & 0xff], `selectRegister(${hex(register)})`); },
	writeRegister(register, value) {
		return this.selectRegister(register) && this.adlxWrite([0x01, value & 0xff], `writeRegister(${hex(register)}, ${hex(value & 0xff)})`);
	},
	readRegister(register) {
		if (!this.selectRegister(register)) return { ok: false, value: -1 };
		const result = bus.ReadByte(0x81);
		if (Array.isArray(result)) { log(`readRegister(${hex(register)}) -> code=${result[0]} value=${result[1]}`); return { ok: result[0] === 0, value: result[1] }; }
		if (typeof result === "number") { log(`readRegister(${hex(register)}) -> raw=${result}`); return { ok: true, value: result & 0xff }; }
		log(`readRegister(${hex(register)}) -> unexpected result=${result}`);
		return { ok: false, value: -1 };
	},
	setDirectMode(enabled) { return this.writeRegister(REG.direct, enabled ? 0x01 : 0x00) && this.writeRegister(REG.apply, 0x01); },
	writeDirectColors(data, dirtyLeds) {
		for (const led of dirtyLeds) {
			const offset = led * 3;
			for (let byte = 0; byte < 3; byte++) if (!this.writeRegister(REG.colorsDirect + offset + byte, data[offset + byte])) return false;
		}
		return this.writeRegister(REG.apply, 0x01);
	},
	verifyFirstColor(expected) {
		for (let byte = 0; byte < 3; byte++) {
			const read = this.readRegister(REG.colorsDirect + byte);
			if (!read.ok || read.value !== expected[byte]) { log(`verify FAIL at ${hex(REG.colorsDirect + byte)}: got=${read.value} expected=${expected[byte]}`); return false; }
		}
		return true;
	},
	restoreState(state) {
		return this.writeRegister(REG.mode, state.mode) && this.writeRegister(REG.speed, state.speed) && this.writeRegister(REG.direction, state.direction) && this.writeRegister(REG.direct, state.direct) && this.writeRegister(REG.apply, 0x01);
	},
	probeHealth() {
		const result = { sig: [], sigOk: true, deviceName: "", state: null };
		for (let register = 0xa0; register < 0xa4; register++) {
			const valueOrCode = bus.ReadByte(register);
			let code = 0;
			let value = -1;
			if (Array.isArray(valueOrCode)) { code = valueOrCode[0]; value = valueOrCode[1]; }
			else if (typeof valueOrCode === "number") value = valueOrCode;
			result.sig.push({ reg: hex(register), code, value });
			if (code !== 0 || value !== register - 0xa0) { result.sigOk = false; log(`Signature mismatch at ${hex(register)}; stopping probe.`); return result; }
		}
		const nameBytes = [];
		for (let index = 0; index < 16; index++) {
			const read = this.readRegister(REG.deviceName + index);
			if (!read.ok) break;
			if (read.value > 0) nameBytes.push(read.value);
		}
		result.deviceName = String.fromCharCode(...nameBytes);
		const direct = this.readRegister(REG.direct);
		const mode = this.readRegister(REG.mode);
		const speed = this.readRegister(REG.speed);
		const direction = this.readRegister(REG.direction);
		if (!direct.ok || !mode.ok || !speed.ok || !direction.ok) { result.sigOk = false; log("State read failed; refusing controller activation."); return result; }
		result.state = { direct: direct.value, mode: mode.value, speed: speed.value, direction: direction.value };
		return result;
	},
};
