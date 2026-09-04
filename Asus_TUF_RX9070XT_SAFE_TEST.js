// SAFE TEST ONLY — based on Asus_AMD_GPU.js.
// This version never enables Direct Mode, never writes RGB data, and never sends Apply.
// Note: reading 16-bit ENE registers requires a volatile register-pointer selection
// (WriteBlock [00, reg_hi, reg_lo]) before ReadByte(0x81). It does not write RGB/mode data.

export function Name() {
	return "ASUS TUF RX 9070 XT Safe Read Test";
}
export function Version() {
	return "1.0.0-safe-test";
}
export function Publisher() {
	return "gpu-light / safe-test derivative";
}
export function Documentation() {
	return "troubleshooting/asus";
}
export function Type() {
	return "SMBUS";
}
export function Size() {
	return [4, 1];
}
export function LedNames() {
	return vLedNames;
}
export function LedPositions() {
	return vLedPositions;
}
export function ConflictingProcesses() {
	return ["LightingService.exe", "OpenRGB.exe"];
}
export function DeviceType() {
	return "gpu";
}
export function ImageUrl() {
	return "https://assets.signalrgb.com/devices/default/gpu.png";
}

/* global bus device */

const ENE_I2C_ADDR = 0x67;
const EXPECTED_VENDOR = 0x1043;
const EXPECTED_PRODUCT = 0x7550;
const EXPECTED_SUBDEVICE = 0x0613;
const LED_COUNT = 4;
const LOG_TAG = "[AsusTufRx9070XtSafeTest]";

const REG = {
	deviceName: 0x1000,
	direct: 0x8020,
	mode: 0x8021,
};

let vLedNames = [];
/** @type {LedPosition[]} */
let vLedPositions = [];
let initialized = false;

function log(message) {
	console.log(`${LOG_TAG} ${message}`);
}

function hex(value) {
	return `0x${value.toString(16)}`;
}

function isExpectedGpu() {
	return (
		bus.IsAMDGpuBus() &&
		bus.SubVendor() === EXPECTED_VENDOR &&
		bus.Product() === EXPECTED_PRODUCT &&
		bus.SubDevice() === EXPECTED_SUBDEVICE
	);
}

/**
 * @param {FreeAddressBus} scanBus
 */
export function Scan(scanBus) {
	const amd = scanBus.IsAMDGpuBus();
	const subVendor = scanBus.SubVendor();
	const product = scanBus.Product();
	const subDevice = scanBus.SubDevice();

	scanBus.log(
		`${LOG_TAG} Scan: IsAMD=${amd} SubVendor=${hex(subVendor)} Product=${hex(product)} SubDevice=${hex(subDevice)} Name="${scanBus.Name()}"`,
		{ toFile: true },
	);

	if (
		!amd ||
		subVendor !== EXPECTED_VENDOR ||
		product !== EXPECTED_PRODUCT ||
		subDevice !== EXPECTED_SUBDEVICE
	) {
		scanBus.log(`${LOG_TAG} Scan skip: device is not ASUS 0x7550 / 0x0613`, { toFile: true });
		return [];
	}

	scanBus.log(`${LOG_TAG} Scan HIT: ASUS TUF Radeon RX 9070 XT Gaming OC @0x67`, { toFile: true });
	return [ENE_I2C_ADDR];
}

export function Initialize() {
	initialized = false;
	try {
		log(
			`Initialize: Vendor=${hex(bus.Vendor())} SubVendor=${hex(bus.SubVendor())} Product=${hex(bus.Product())} SubDevice=${hex(bus.SubDevice())} Bus="${bus.Name()}"`,
		);

		if (!isExpectedGpu()) {
			log("ABORT: PCI/ASUS identity check failed. No controller access performed.");
			return;
		}

		device.setName("ASUS TUF Radeon RX 9070 XT Gaming OC (Safe Read Test)");
		setupLeds();

		const health = Ene.probeHealth();
		log(`probeHealth: ${JSON.stringify(health)}`);
		if (!health.sigOk) {
			log("ABORT: ENE signature check failed. No further register reads or writes will be performed.");
			return;
		}

		initialized = true;
		log("PASS: identity and ENE signature verified. Read-only test complete; Direct Mode and RGB writes remain disabled.");
	} catch (error) {
		log(`Initialize EXCEPTION: ${error && error.stack ? error.stack : error}`);
	}
}

export function Render() {
	// Intentionally empty: this safe test never sends RGB data.
}

export function Shutdown(SystemSuspending) {
	log(`Shutdown: SystemSuspending=${SystemSuspending}; no hardware command sent.`);
	initialized = false;
}

function setupLeds() {
	vLedNames = [];
	vLedPositions = [];
	for (let index = 0; index < LED_COUNT; index++) {
		vLedNames.push(`LED ${index + 1}`);
		vLedPositions.push([index, 0]);
	}
	device.setControllableLeds(vLedNames, vLedPositions);
	device.setSize([LED_COUNT, 1]);
}

const Ene = {
	// Required only to select the ENE read pointer. No RGB, mode, direct, or apply value is written.
	selectRegister(register) {
		const high = (register >> 8) & 0xff;
		const low = register & 0xff;
		const result = bus.WriteBlock(0, 3, [0x00, high, low]);
		const ok = result === 0;
		log(`selectReadPointer(${hex(register)}) -> code=${result}${ok ? " OK" : " FAIL"}`);
		return ok;
	},

	readRegister(register) {
		if (!this.selectRegister(register)) {
			return { ok: false, value: -1 };
		}
		const result = bus.ReadByte(0x81);
		if (Array.isArray(result)) {
			const [code, value] = result;
			log(`readRegister(${hex(register)}) -> code=${code} value=${value}`);
			return { ok: code === 0, value };
		}
		if (typeof result === "number") {
			log(`readRegister(${hex(register)}) -> raw=${result}`);
			return { ok: true, value: result & 0xff };
		}
		log(`readRegister(${hex(register)}) -> unexpected result=${result}`);
		return { ok: false, value: -1 };
	},

	probeHealth() {
		const result = { sig: [], sigOk: true, deviceName: "", direct: null, mode: null };

		for (let register = 0xa0; register < 0xa4; register++) {
			const readResult = bus.ReadByte(register);
			let code = 0;
			let value = -1;
			if (Array.isArray(readResult)) {
				code = readResult[0];
				value = readResult[1];
			} else if (typeof readResult === "number") {
				value = readResult;
			}
			result.sig.push({ reg: hex(register), code, value });
			if (code !== 0 || value !== register - 0xa0) {
				result.sigOk = false;
				log(`signature mismatch at ${hex(register)}: code=${code} value=${value}; stopping probe.`);
				return result;
			}
		}

		const nameBytes = [];
		for (let index = 0; index < 16; index++) {
			const read = this.readRegister(REG.deviceName + index);
			if (!read.ok) break;
			if (read.value > 0) nameBytes.push(read.value);
		}
		result.deviceName = String.fromCharCode(...nameBytes);
		result.direct = this.readRegister(REG.direct);
		result.mode = this.readRegister(REG.mode);
		return result;
	},
};
