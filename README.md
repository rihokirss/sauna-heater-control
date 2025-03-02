# Sauna Heater Control for Shelly Plus 2PM

## Overview

This repository contains two JavaScript scripts designed for the **Shelly Plus 2PM** smart relay, equipped with a **Shelly Addon** featuring two **DS18B20 temperature sensors**. These scripts provide an **automated, safe, and configurable** solution for managing a sauna heater, ensuring efficient operation while maintaining safety standards.

## Scripts Description

### **1. Sauna Heater Control Script (`sauna_heater_control.js`)**

This script is responsible for the real-time **monitoring and control** of the sauna heater. It continuously reads the temperature from two DS18B20 sensors placed at different locations within the sauna, ensuring safe and efficient heating.

#### **Key Features:**
- **Automatic temperature regulation:** Maintains the sauna at a user-defined setpoint.
- **Temperature fluctuation control:** Prevents excessive temperature variations by turning the heater on/off within a defined range.
- **Overheating protection:** Automatically stops the heater if:
  - The maximum allowed temperature is exceeded.
  - The temperature difference between the two sensors exceeds a predefined safety threshold.
- **Configurable sensor failure handling:** The heater will only shut down if sensor readings fail **for a configurable number of consecutive attempts** (`consecutive_null_threshold`).
- **Maximum operation time:** Prevents the sauna from running indefinitely by enforcing a hard limit on operating time.
- **User control via Shelly input:** Allows manual activation and deactivation of the sauna via a connected switch.
- **Integrated safety script monitoring:** Ensures that the heater does not operate if the safety watchdog script is not running.
- **Debug mode for troubleshooting:** Provides detailed logs for system diagnostics.

#### **Configurable Parameters (`CONFIG` object)**
The script includes a set of user-configurable parameters to customize its behavior:

| Parameter | Description | Default Value |
|-----------|-------------|---------------|
| `temp_setpoint` | Target sauna temperature | `80°C` |
| `temp_delta` | Allowed temperature fluctuation before toggling the heater | `5°C` |
| `timer_on` | Maximum sauna runtime (in milliseconds) | `5 hours` |
| `switch_id` | Shelly switch ID controlling the heater | `0` |
| `greenlight_id` | Shelly switch ID controlling the indicator light | `1` |
| `input_id` | Shelly input ID for manual sauna activation | `0` |
| `thermal_runaway` | Maximum allowed temperature difference between sensors | `30°C` |
| `thermal_runaway_max` | Maximum safe temperature | `110°C` |
| `safety_script_name` | Name of the safety watchdog script | `"heater_watchdog"` |
| `consecutive_null_threshold` | Number of consecutive failed sensor readings before stopping the heater | `5` |
| `debug` | Enable/disable debug logs | `true` |

### **2. Heater Monitoring Script (`heater_watchdog.js`)**

This script acts as a **fail-safe mechanism**, ensuring that the main control script is running and that the heater is not left on unintentionally.

#### **Functions:**
- Periodically **checks if the `sauna_heater_control.js` script is running**.
- Automatically **turns off the sauna heater** if the primary control script stops or encounters an error.
- Provides an extra layer of **safety and reliability** by preventing unexpected heater operation.

## **Application & Use Case**

These scripts are specifically designed for **Shelly Plus 2PM** smart relays and can be used in **home automation setups** where sauna **safety, efficiency, and automation** are priorities. 

Users with **basic JavaScript knowledge** and experience with **Shelly devices** can easily modify the scripts to fit their specific needs.

## **Installation**

To install and use these scripts:

1. **Set up your Shelly Plus 2PM** with the necessary addons and DS18B20 temperature sensors.
2. **Customize the script configuration (`CONFIG` object)** to match your sauna setup.
3. **Upload the scripts to your Shelly device**:
   - Navigate to the **Shelly Script Editor** in the **Shelly web interface**.
   - Copy and paste the scripts (`sauna_heater_control.js` and `heater_watchdog.js`) into separate scripts.
   - Save and run the scripts.
4. **Configure the startup behavior**:
   - Ensure that **both scripts start automatically** when the Shelly device is powered on.
5. **Monitor the system logs** (if debug mode is enabled) to verify correct operation.

## **Customization & Troubleshooting**

- **To adjust the sauna temperature:** Modify `temp_setpoint` in the `CONFIG` object.
- **To change how often sensor readings are checked:** Adjust the `Timer.set()` interval (default `10 seconds`).
- **To prevent temporary sensor failures from shutting down the heater:** Increase `consecutive_null_threshold`.
- **To disable debugging messages:** Set `debug: false` in the `CONFIG` object.

## **Contributions**

Contributions and improvements are welcome! If you encounter any issues or have suggestions for enhancements, feel free to:

- **Open an issue** to report a bug or suggest a feature.
- **Submit a pull request** with code improvements or optimizations.

---
