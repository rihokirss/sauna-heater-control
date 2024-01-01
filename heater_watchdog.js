let CONFIG = {
  switch_id: 0,                       // Shelly switch ID for heater control
  script_name: "heater_control",      // Name of the script to be monitored
  debug: false                        // Debug mode status
};

function check() {
  Shelly.call('Script.List', {}, function(result, err_code, err_message) {
    if (err_code === 0) {
      let scriptFound = false;
      let scriptRunning = false;

      // Use a for-loop to search for the script
      for (let i = 0; i < result.scripts.length; i++) {
        if (result.scripts[i].name === CONFIG.script_name) {
          scriptFound = true;
          scriptRunning = result.scripts[i].running;
          break;
        }
      }

      // Check if the script is found and whether it's running
      if (scriptFound && !scriptRunning) {
        Shelly.call("Switch.Set", { id: CONFIG.switch_id, on: false });
        if (CONFIG.debug) console.log("Heater control script not running, heater turned off");
      } else {
        if (CONFIG.debug) console.log("Heater control script is running");
      }
    } else {
      Shelly.call("Switch.Set", { id: CONFIG.switch_id, on: false });
      console.log("Error listing scripts: " + err_message);
    }
  });
}

Timer.set(5000, true, check);