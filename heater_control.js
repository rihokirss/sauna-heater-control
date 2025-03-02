let CONFIG = {
  temp_setpoint: 80,            // Desired sauna temperature
  temp_delta: 5,                // Temperature change limit
  timer_on: 5 * 60 * 60 * 1000, // Maximum operating time (5 hours)
  switch_id: 0,                 // Shelly switch ID for heater control
  greenlight_id: 1,             // Shelly switch ID for heater control
  input_id: 0,                  // Input ID for sauna control
  thermal_runaway: 30,          // Max allowed temperature difference
  thermal_runaway_max: 110,     // Max allowed temperature
  safety_script_name: "heater_watchdog", // Name of the watchdog script
  consecutive_null_threshold: 5, // Number of consecutive failed sensor readings before stopping
  debug: false                   // Debug mode status
};

let saunaActive = false;        // Boolean indicating if sauna control is active
let startTime = null;           // Timer tracking the start of sauna operation
let error_difference = false;
let error_maxtemp = false;
let safetyScriptRunning = true; // Global variable for the status of the safety script
let errorActive = false;        // Global error status
let blinkTimer = null;          // Timer for blinking the green light
let consecutiveNullCount = 0;   // Counter for consecutive sensor read failures

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
}

// Set a timer to read temperature every 10 seconds
Timer.set(10000, true, ControlSauna);

// Logs the input status if debug mode is enabled
if (CONFIG.debug) {
   console.log("START: Sauna active: " + saunaActive);
   console.log("START: Heater on: " + Shelly.getComponentStatus('Switch', CONFIG.switch_id).output);
   console.log("START: Sauna switch on: " + Shelly.getComponentStatus('Input', CONFIG.switch_id).state);
}
