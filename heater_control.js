let CONFIG = {
  temp_setpoint: 75,            // Desired sauna temperature
  temp_delta: 5,                // Temperature change limit
  timer_on: 5 * 60 * 60 * 1000, // Maximum operating time (5 hours)
  switch_id: 0,                 // Shelly switch ID for heater control
  input_id: 0,                  // Input ID for sauna control
  thermal_runaway: 30,          // Max allowed temperature difference
  thermal_runaway_max: 110,     // Max allowed temperature
  safety_script_name: "heater_watchdog", // Name of the watchdog script
  debug: true                   // Debug mode status
};

let saunaActive = false;        // Boolean indicating if sauna control is active
let startTime = null;           // Timer tracking the start of sauna operation
let error_difference = false;
let error_maxtemp = false;
let safetyScriptRunning = true; // Global variable for the status of the safety script

// Error checking
function errorCheck() {
  let sauna_temp1 = Shelly.getComponentStatus('Temperature', 100).tC; // First sensor
  let sauna_temp2 = Shelly.getComponentStatus('Temperature', 101).tC; // Second sensor
  
  checkSafetyScript(); // Check if the safety script is running
  
  // Temperature difference
  if (Math.abs(sauna_temp1 - sauna_temp2) > CONFIG.thermal_runaway) {
    error_difference = true;
    console.log("ERROR: sensor temperature difference");
    console.log("Temp1: " + sauna_temp1 + ", Temp2: " + sauna_temp2);
  } else {
    error_difference = false;
  }
  // Max temperature reached
  if (Math.max(sauna_temp1, sauna_temp2) > CONFIG.thermal_runaway_max) {
    error_maxtemp = true;
    console.log("ERROR: max allowed temperature exceeded");
  } else {
    error_maxtemp = false;
  }
  
  // Activate error
  if (error_difference || error_maxtemp || !safetyScriptRunning || !sauna_temp1 || !sauna_temp2) {
    Shelly.call("Switch.Set", { id: CONFIG.switch_id, on: false });
    saunaActive = false;
    console.log("ERROR: heater stopped");
    return true;
  } else {
    return false;
  }
}

// Check if the safety script is running. If not, return false
function checkSafetyScript() {
  Shelly.call('Script.List', {}, function(result, err_code, err_message) {
    if (err_code === 0) {
      let scriptFound = false;
      let scriptRunning = false;

      // Use a for-loop to search for the script
      for (let i = 0; i < result.scripts.length; i++) {
        if (result.scripts[i].name === CONFIG.safety_script_name) {
          scriptFound = true;
          scriptRunning = result.scripts[i].running;
          break;
        }
      }

      // Check if the script is found and running
      if (scriptFound && !scriptRunning) {
        if (CONFIG.debug) console.log("Check script not running");
        safetyScriptRunning = false;
      } else {
        if (CONFIG.debug) console.log("Check script running");
        safetyScriptRunning = true;
      }
    } else {
      console.log("Error listing scripts: " + err_message);
      safetyScriptRunning = false;
    }
  });
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
  if (heater_active && (error_active || Math.max(sauna_temp1, sauna
