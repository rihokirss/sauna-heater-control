/*
 * INITIAL CONFIGURATION SETTINGS
 * After the initial run, all settings are stored in:
 * 1) Virtual components (Gen3, Gen4, or Pro devices with FW >= 1.4.3) OR
 * 2) Shelly KVS (older devices)
 *
 * To modify settings on devices with Virtual Components:
 * - Access the web UI and adjust settings directly
 *
 * To modify settings on devices with KVS storage:
 * - Access Menu → Advanced → KVS on the Shelly web page
 * - Update the SaunaConfig key
 * - Restart the script to apply changes
 */
let CONFIG = {
  temp_setpoint: 80,            // Desired sauna temperature (°C)
  temp_delta: 5,                // Temperature change limit (°C)
  timer_on: 5 * 60 * 60 * 1000, // Maximum operating time in ms (5 hours)
  switch_id: 0,                 // Shelly switch ID for heater control
  greenlight_id: 1,             // Shelly switch ID for green light control
  input_id: 0,                  // Input ID for sauna control
  thermal_runaway: 30,          // Max allowed temperature difference (°C)
  thermal_runaway_max: 110,     // Max allowed temperature (°C)
  safety_script_name: "heater_watchdog", // Name of the watchdog script
  consecutive_null_threshold: 5, // Number of consecutive failed sensor readings before stopping
  debug: false,                  // Debug mode status
  manualKVS: false              // Force KVS mode (true) instead of Virtual Components (false)
};

let saunaActive = false;        // Boolean indicating if sauna control is active
let startTime = null;           // Timer tracking the start of sauna operation
let error_difference = false;
let error_maxtemp = false;
let safetyScriptRunning = true; // Global variable for the status of the safety script
let errorActive = false;        // Global error status
let blinkTimer = null;          // Timer for blinking the green light
let consecutiveNullCount = 0;   // Counter for consecutive sensor read failures

let scriptState = {
  scriptId: Shelly.getCurrentScriptId(),
  printId: "SaunaCtrl: ",
  configLoaded: false,
  version: 1.1,
  asyncCounter: 0
};

/*  =========  VIRTUAL COMPONENTS & KVS FUNCTIONS  =========  */

// Define Virtual Component structure for sauna control
function defineVirtualComponents() {
  return [
    {
      type: "group", id: 200, config: {
        name: "Sauna Control"
      }
    },
    {
      type: "number", id: 200, config: {
        name: "Target Temperature",
        default_value: 80,
        min: 40,
        max: 120,
        persisted: true,
        meta: { ui: { view: "slider", unit: "°C", webIcon: 1 } }
      }
    },
    {
      type: "number", id: 201, config: {
        name: "Temperature Delta",
        default_value: 5,
        min: 1,
        max: 15,
        persisted: true,
        meta: { ui: { view: "slider", unit: "°C", webIcon: 1 } }
      }
    },
    {
      type: "number", id: 202, config: {
        name: "Max Runtime (hours)",
        default_value: 5,
        min: 1,
        max: 12,
        persisted: true,
        meta: { ui: { view: "slider", unit: "h", webIcon: 13 } }
      }
    },
    {
      type: "number", id: 203, config: {
        name: "Sensor Diff Limit",
        default_value: 30,
        min: 10,
        max: 50,
        persisted: true,
        meta: { ui: { view: "slider", unit: "°C", webIcon: 8 } }
      }
    },
    {
      type: "number", id: 204, config: {
        name: "Max Safety Temp",
        default_value: 110,
        min: 80,
        max: 150,
        persisted: true,
        meta: { ui: { view: "slider", unit: "°C", webIcon: 8 } }
      }
    },
    {
      type: "number", id: 205, config: {
        name: "Sensor Fail Threshold",
        default_value: 5,
        min: 1,
        max: 20,
        persisted: true,
        meta: { ui: { view: "slider", unit: "attempts", webIcon: 8 } }
      }
    }
  ];
}

// Check if Shelly device supports Virtual Components
function isVirtualComponentsSupported() {
  const info = Shelly.getDeviceInfo();

  if (CONFIG.manualKVS === true) {
    print(scriptState.printId, "manualKVS=true → forcing KVS mode");
    return false;
  }

  // Gen4 and Gen3 OK; Gen2 only Pro models with FW >= 1.4.3
  const gen2ok = (info.gen === 2 &&
                  (info.app || "").substring(0, 3) === "Pro" &&
                  compareVersion('1.4.3', info.ver));
  return (info.gen === 4 || info.gen === 3 || gen2ok);
}

// Compare Shelly firmware versions
function compareVersion(minVersion, currentVersion) {
  const minParts = minVersion.split('.');
  const currentParts = currentVersion.split('.');
  for (let i = 0; i < currentParts.length; i++) {
    let a = ~~currentParts[i]; // parse int
    let b = ~~minParts[i];     // parse int
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

// Load configuration from Virtual Components into memory
function loadConfigFromVC() {
  scriptState.asyncCounter++;
  let vcMapping = [
    ["temp_setpoint", "number:200"],
    ["temp_delta", "number:201"],
    ["timer_on", "number:202"],
    ["thermal_runaway", "number:203"],
    ["thermal_runaway_max", "number:204"],
    ["consecutive_null_threshold", "number:205"]
  ];

  Shelly.call("Shelly.GetComponents", { dynamic_only: true, include: ["status"] },
    function (res, err) {
      if (err === 0 && res && res.components) {
        let components = res.components;
        for (let i = 0; i < vcMapping.length; i++) {
          for (let j = 0; j < components.length; j++) {
            if (vcMapping[i][1] === components[j].key) {
              let value = components[j].status.value;
              // Convert timer from hours to milliseconds
              if (vcMapping[i][0] === "timer_on") {
                CONFIG[vcMapping[i][0]] = value * 60 * 60 * 1000;
              } else {
                CONFIG[vcMapping[i][0]] = value;
              }
              break;
            }
          }
        }
        print(scriptState.printId, "Configuration loaded from Virtual Components");
        scriptState.configLoaded = true;
      }
      scriptState.asyncCounter--;
    }
  );
}

// Save configuration to KVS (using short keys to stay under 255 char limit)
function saveConfigToKVS() {
  let kvsData = {
    ts: CONFIG.temp_setpoint,
    td: CONFIG.temp_delta,
    to: CONFIG.timer_on,
    si: CONFIG.switch_id,
    gi: CONFIG.greenlight_id,
    ii: CONFIG.input_id,
    tr: CONFIG.thermal_runaway,
    tm: CONFIG.thermal_runaway_max,
    sn: CONFIG.safety_script_name,
    ct: CONFIG.consecutive_null_threshold,
    db: CONFIG.debug,
    mk: CONFIG.manualKVS,
    v: scriptState.version
  };

  Shelly.call("KVS.set",
    { key: "SaunaConfig" + scriptState.scriptId, value: JSON.stringify(kvsData) },
    function (res, err, msg) {
      if (err !== 0) {
        console.log(scriptState.printId, "Failed to save config to KVS:", msg);
      } else {
        console.log(scriptState.printId, "Configuration saved to KVS");
      }
    }
  );
}

// Load configuration from KVS (supports both old long keys and new short keys)
function loadConfigFromKVS() {
  scriptState.asyncCounter++;
  Shelly.call('KVS.Get', { key: "SaunaConfig" + scriptState.scriptId },
    function (res, err) {
      if (err === 0 && res && res.value) {
        let data = JSON.parse(res.value);
        // Support both old (long) and new (short) key formats
        CONFIG.temp_setpoint = data.ts || data.temp_setpoint;
        CONFIG.temp_delta = data.td || data.temp_delta;
        CONFIG.timer_on = data.to || data.timer_on;
        CONFIG.switch_id = data.si !== undefined ? data.si : data.switch_id;
        CONFIG.greenlight_id = data.gi !== undefined ? data.gi : data.greenlight_id;
        CONFIG.input_id = data.ii !== undefined ? data.ii : data.input_id;
        CONFIG.thermal_runaway = data.tr || data.thermal_runaway;
        CONFIG.thermal_runaway_max = data.tm || data.thermal_runaway_max;
        CONFIG.safety_script_name = data.sn || data.safety_script_name;
        CONFIG.consecutive_null_threshold = data.ct || data.consecutive_null_threshold;
        CONFIG.debug = data.db !== undefined ? data.db : data.debug;
        CONFIG.manualKVS = typeof (data.mk || data.manualKVS) === "boolean" ? (data.mk || data.manualKVS) : CONFIG.manualKVS;
        print(scriptState.printId, "Configuration loaded from KVS");
        scriptState.configLoaded = true;
      }
      scriptState.asyncCounter--;
    }
  );
}

// Delete all existing Virtual Components (for clean installation)
function deleteVirtualComponents(components) {
  if (scriptState.asyncCounter < 5) {
    for (let i = 0; i < 1 && i < components.length; i++) {
      let key = components.splice(0, 1)[0].key;
      scriptState.asyncCounter++;
      Shelly.call("Virtual.Delete", { key: key },
        function (res, err, msg) {
          if (err === 0) {
            print(scriptState.printId, "Deleted virtual component: " + key);
          } else {
            print(scriptState.printId, "Failed to delete VC:", msg);
          }
          scriptState.asyncCounter--;
        }
      );
    }
  }

  if (components.length > 0) {
    Timer.set(1000, false, deleteVirtualComponents, components);
  } else {
    waitForAsync(createVirtualComponents);
  }
}

// Create Virtual Components
function createVirtualComponents() {
  let vcDefinitions = defineVirtualComponents();
  addVirtualComponents(vcDefinitions);
}

// Add Virtual Components one by one
function addVirtualComponents(vcList) {
  if (scriptState.asyncCounter < 5) {
    for (let i = 0; i < 1 && i < vcList.length; i++) {
      let comp = vcList.splice(0, 1)[0];
      scriptState.asyncCounter++;
      Shelly.call("Virtual.Add",
        { type: comp.type, id: comp.id, config: comp.config },
        function (res, err, msg) {
          if (err === 0) {
            print(scriptState.printId, "Created virtual component:", res.key);
          } else {
            print(scriptState.printId, "Failed to create VC:", msg);
          }
          scriptState.asyncCounter--;
        }
      );
    }
  }

  if (vcList.length > 0) {
    Timer.set(1000, false, addVirtualComponents, vcList);
  } else {
    waitForAsync(setVirtualComponentGroup);
  }
}

// Group Virtual Components together
function setVirtualComponentGroup() {
  let groupConfig = {
    id: 200,
    value: [
      "number:200",
      "number:201",
      "number:202",
      "number:203",
      "number:204",
      "number:205"
    ]
  };

  Shelly.call("Group.Set", groupConfig, function (res, err, msg) {
    if (err !== 0) {
      print(scriptState.printId, "Failed to set group config:", msg);
    } else {
      print(scriptState.printId, "Virtual components grouped successfully");
    }
    loadConfigFromVC();
  });
}

// Wait for async operations to complete
function waitForAsync(callback) {
  if (scriptState.asyncCounter !== 0) {
    Timer.set(1000, false, waitForAsync, callback);
    return;
  }
  callback();
}

// Initialize configuration system
function initializeConfig() {
  if (isVirtualComponentsSupported()) {
    print(scriptState.printId, "Virtual Components mode detected");
    // Check if we need to create VCs by looking at KVS version
    Shelly.call('KVS.Get', { key: "SaunaConfig" + scriptState.scriptId },
      function (kvsRes, kvsErr) {
        let needsVCCreation = true;

        // If KVS exists and has version >= 1.0, VCs should already exist
        if (kvsErr === 0 && kvsRes && kvsRes.value) {
          let kvsData = JSON.parse(kvsRes.value);
          let ver = kvsData.v || kvsData.version; // Support both short and long key
          if (ver && ver >= 1.0) {
            needsVCCreation = false;
          }
        }

        if (needsVCCreation) {
          print(scriptState.printId, "Creating new Virtual Components (first run)");
          createVirtualComponents();
          // Save version to KVS to mark that VCs are created
          saveConfigToKVS();
        } else {
          print(scriptState.printId, "Loading configuration from existing Virtual Components");
          loadConfigFromVC();
        }
      }
    );
  } else {
    print(scriptState.printId, "KVS storage mode");
    loadConfigFromKVS();
    // Save initial config if not exists
    Timer.set(2000, false, function() {
      if (!scriptState.configLoaded) {
        saveConfigToKVS();
      }
    });
  }
}

/*  =========  END: VIRTUAL COMPONENTS & KVS FUNCTIONS  =========  */

// Error checking – modified to wait for 'consecutive_null_threshold' failed readings before stopping
function errorCheck() {
  let sauna_temp1 = Shelly.getComponentStatus('Temperature', 100).tC; // First sensor
  let sauna_temp2 = Shelly.getComponentStatus('Temperature', 101).tC; // Second sensor
  
  let errorMessages = [];
  
  // Check if sensor readings are available
  if (typeof sauna_temp1 !== 'number' || typeof sauna_temp2 !== 'number') {
      consecutiveNullCount++;
      if (consecutiveNullCount < CONFIG.consecutive_null_threshold) {
          if (CONFIG.debug) console.log("WARNING: Sensor data missing (attempt " + consecutiveNullCount + "/" + CONFIG.consecutive_null_threshold + "). Temp1: " + sauna_temp1 + ", Temp2: " + sauna_temp2);
          return false;
      } else {
          errorMessages.push("Invalid or missing sensor data after " + CONFIG.consecutive_null_threshold + " consecutive readings. Temp1: " + sauna_temp1 + ", Temp2: " + sauna_temp2);
      }
  } else {
      consecutiveNullCount = 0; // Reset counter when data is available
  }
  
  // Check if the safety script is running
  checkSafetyScript();
  
  // Temperature difference check
  let diff = Math.abs(sauna_temp1 - sauna_temp2);
  if (diff > CONFIG.thermal_runaway) {
      error_difference = true;
      errorMessages.push("Sensor temperature difference exceeded limit. Limit: " + CONFIG.thermal_runaway + ", actual: " + diff);
  } else {
      error_difference = false;
  }
  
  // Max temperature check
  let maxTemp = Math.max(sauna_temp1, sauna_temp2);
  if (maxTemp > CONFIG.thermal_runaway_max) {
      error_maxtemp = true;
      errorMessages.push("Max allowed temperature exceeded. Limit: " + CONFIG.thermal_runaway_max + ", actual: " + maxTemp);
  } else {
      error_maxtemp = false;
  }
  
  // Check if safety script is running
  if (!safetyScriptRunning) {
      errorMessages.push("Safety script '" + CONFIG.safety_script_name + "' is not running.");
  }
  
  // If any error condition is met, stop the heater and log errors
  if (errorMessages.length > 0) {
      Shelly.call("Switch.Set", { id: CONFIG.switch_id, on: false });
      saunaActive = false;
      errorActive = true;
      console.log("ERROR: Heater stopped due to the following reasons:");
      errorMessages.forEach(function(msg) {
         console.log("  - " + msg);
      });
      startBlinkingGreenLight();
      return true;
  } else {
      errorActive = false;
      stopBlinkingGreenLight();
      return false;
  }
}

// Check if the safety script is running. If not, return false
function checkSafetyScript() {
  Shelly.call('Script.List', {}, function(result, err_code, err_message) {
    if (err_code === 0) {
      let scriptFound = false;
      let scriptRunning = false;

      for (let i = 0; i < result.scripts.length; i++) {
        
        if (result.scripts[i].name === CONFIG.safety_script_name) {
          //print(result.scripts[i].name);
          //print(CONFIG.safety_script_name);
          scriptFound = true;
          scriptRunning = result.scripts[i].running;
          break;
        }
      }
      
      if (scriptFound) {
          if (scriptRunning) {
              if (CONFIG.debug) console.log("DEBUG: Safety script '" + CONFIG.safety_script_name + "' is running.");
              safetyScriptRunning = true;
          } else {
              console.log("ERROR: Safety script '" + CONFIG.safety_script_name + "' found but not running.");
              safetyScriptRunning = false;
          }
      } else {
          console.log("ERROR: Safety script '" + CONFIG.safety_script_name + "' not found.");
          safetyScriptRunning = false;
      }
    } else {
      console.log("ERROR: Failed to list scripts: " + err_message);
      safetyScriptRunning = false;
    }
  });
}

// Function to start blinking the green light
function startBlinkingGreenLight() {
  if (blinkTimer === null) {
    blinkTimer = Timer.set(1000, true, function() {
      let currentState = Shelly.getComponentStatus('Switch', CONFIG.greenlight_id).output;
      Shelly.call("Switch.Set", { id: CONFIG.greenlight_id, on: !currentState });
    });
    if (CONFIG.debug) console.log("DEBUG: Green light started blinking.");
  }
}

// Function to stop blinking the green light
function stopBlinkingGreenLight() {
  if (blinkTimer !== null) {
    Timer.clear(blinkTimer);
    blinkTimer = null;
    Shelly.call("Switch.Set", { id: CONFIG.greenlight_id, on: false });
    if (CONFIG.debug) console.log("DEBUG: Green light blinking stopped.");
  }
}

// Function to read temperature and control the heater
function ControlSauna() {
  let heater_active = Shelly.getComponentStatus('Switch', CONFIG.switch_id).output; // Get the current state of the heater
  let sauna_temp1 = Shelly.getComponentStatus('Temperature', 100).tC; // First sensor
  let sauna_temp2 = Shelly.getComponentStatus('Temperature', 101).tC; // Second sensor
  let timeActive = Date.now() - startTime;
  let error_active = errorCheck();
  
  // If sauna control is not active or operating time exceeded and heater is active, turn off the heater
  if (error_active || !saunaActive || !startTime || (Date.now() - startTime) > CONFIG.timer_on) {
    if (heater_active) {
      Shelly.call("Switch.Set", { id: CONFIG.switch_id, on: false });
      if (CONFIG.debug) console.log("Heater turned off. saunaActive:" + saunaActive + " startTime:" + startTime + " timeActive:" + Math.round(timeActive / 1000));
    }
    // stop further function execution
    return;
  }

  // Turn off the heater if the temperature is too high or sensor readings differ too much
  if (heater_active && (error_active || Math.max(sauna_temp1, sauna_temp2) >= CONFIG.temp_setpoint)) {
    Shelly.call("Switch.Set", { id: CONFIG.switch_id, on: false });
    if (CONFIG.debug) console.log("Heater off, max temp: " + Math.max(sauna_temp1, sauna_temp2));
  } else if (!heater_active && !error_active && (Math.max(sauna_temp1, sauna_temp2) < CONFIG.temp_setpoint - CONFIG.temp_delta)) {
    // Turns on the heater if the temperature is lower than the set limit
    Shelly.call("Switch.Set", { id: CONFIG.switch_id, on: true });
    if (CONFIG.debug) console.log("Heater on, min temp: " + Math.max(sauna_temp1, sauna_temp2));
  }

  if (CONFIG.debug) {
    console.log("Heater active: " + heater_active);
    console.log("Sauna active (s): " + Math.round(timeActive / 1000));
    console.log("Temp1: " + sauna_temp1 + ", Temp2: " + sauna_temp2);   
  }
}

/*  =========  EVENT HANDLERS & INITIALIZATION  =========  */

// Event handler for sauna control input
Shelly.addEventHandler(function (event) {
  if (typeof event.info.event === "undefined") return;
  if (event.info.component === "input:" + JSON.stringify(CONFIG.input_id)) {
    if (event.info.state) {
        saunaActive = true;
        stopBlinkingGreenLight();
        Shelly.call("Switch.Set", { id: CONFIG.greenlight_id, on: true });
        startTime = Date.now(); // Käivitab taimeri, kui sauna on aktiveeritud
        if (CONFIG.debug) {
          console.log("Sauna activated at: " + startTime);
          console.log("Input state: " + event.info.state);
        }
    } else {
        saunaActive = false;   // Lülitab sauna juhtimise välja
        Shelly.call("Switch.Set", { id: CONFIG.greenlight_id, on: false });
        if (CONFIG.debug) {
          console.log("Sauna deactivated");
          console.log("Input state: " + event.info.state);
        }
    }
  }
});

// Initialize configuration (load from Virtual Components or KVS)
initializeConfig();

// Configure switches
Shelly.call("Switch.SetConfig", { id: CONFIG.switch_id, config: {auto_off_delay: CONFIG.timer_on/1000, auto_off: true, auto_on: false, in_mode: "detached", initial_state: "off" }});
Shelly.call("Switch.SetConfig", { id: CONFIG.greenlight_id, config: {in_mode: "detached", initial_state: "off" }});

// Set a timer to read temperature every 10 seconds
Timer.set(10000, true, ControlSauna);

// Logs the input status if debug mode is enabled
if (CONFIG.debug) {
   console.log("START: Sauna active: " + saunaActive);
   console.log("START: Heater on: " + Shelly.getComponentStatus('Switch', CONFIG.switch_id).output);
   console.log("START: Sauna switch on: " + Shelly.getComponentStatus('Input', CONFIG.switch_id).state);
}

print(scriptState.printId, "Sauna heater control script v" + scriptState.version + " started");
