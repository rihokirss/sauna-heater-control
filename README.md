Overview

This repository contains two JavaScript scripts designed for the Shelly Plus 2PM smart relay, equipped with a Shelly addon featuring two DS18B20 temperature sensors. The primary application of these scripts is to control a contactor connected to a sauna heater, ensuring efficient and safe operation of a sauna heating system.

Scripts Description
Sauna Heater Control Script (sauna_heater_control.js)

This script is responsible for the real-time management and safety monitoring of a sauna heater. It utilizes two DS18B20 temperature sensors placed in different corners of the sauna for enhanced safety. The script ensures the following:

Monitoring and maintaining the desired sauna temperature.
Limiting the temperature fluctuation within a predefined range.
Enforcing a maximum operating time for the sauna heater.
Preventing overheating by checking for the maximum allowed temperature and the allowable temperature difference between the two sensors.
The ability to activate and deactivate sauna control via a Shelly input.
Running a safety script to constantly check the system's integrity.
Additionally, the script includes a debug mode for troubleshooting and monitoring system performance.

Heater Monitoring Script (heater_watchdog.js)

This secondary script complements the primary control script by periodically checking the operational status of the sauna_heater_control script. Its functions include:

Regularly verifying if the primary control script is running.
Turning off the sauna heater in case the primary script stops running or encounters an error.
This script acts as a fail-safe mechanism to prevent any unforeseen issues related to the sauna heater's operation.

Application
These scripts are specifically designed for the Shelly Plus 2PM smart relay, with a focus on sauna safety and efficiency. The scripts are intended for users who have a basic understanding of JavaScript and Shelly smart home devices. They offer a customizable and robust solution for sauna temperature management, emphasizing safety through multiple checks and balances.

Installation
To use these scripts:

Ensure your Shelly Plus 2PM is set up with the required addons and sensors.
Customize the configuration parameters in the scripts according to your sauna setup.
Upload the scripts to your Shelly device and configure them to run as required.

Contributions
Contributions to this project are welcome. If you have suggestions for improvements or have encountered issues, please feel free to open an issue or submit a pull request.
