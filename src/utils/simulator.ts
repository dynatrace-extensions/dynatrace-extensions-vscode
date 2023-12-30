/**
  Copyright 2022 Dynatrace LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      https://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

/********************************************************************************
 * UTILITIES RELATED TO SIMULATING EXTENSIONS
 ********************************************************************************/

import * as vscode from "vscode";
import {
  EecType,
  OsType,
  RemoteTarget,
  SimulationConfig,
  SimulationLocation,
} from "../interfaces/simulator";
import { getSimulatorTargets } from "./fileSystem";
import * as logger from "./logging";

const logTrace = ["utils", "simulator"];

/**
 * Gets the default directory where the specified datasource .exe is located.
 * @param os - operating system
 * @param eecType - eec type; oneagent or activegate
 * @param dataSource - datasource name
 * @returns - directory path
 */
export function getDatasourceDir(os: OsType, eecType: EecType, dataSource: string) {
  const eec = eecType === "ONEAGENT" ? "oneagent" : "remotepluginmodule";
  return os === "WINDOWS"
    ? `C:\\Program Files\\dynatrace\\${eec}\\agent\\datasources\\${dataSource}\\`
    : `/opt/dynatrace/${eec}/agent/datasources/${dataSource}/`;
}

/**
 * Gets the name of the datasource executable file.
 * @param eecType - eec type; oneagent or activegate
 * @param dataSource - datasource name
 * @returns name of the file
 */
export function getDatasourceExe(os: OsType, eecType: EecType, dataSource: string) {
  const exePrefix = eecType === "ONEAGENT" ? "oneagent" : "dynatrace";
  return `${exePrefix}source${dataSource}` + (os === "WINDOWS" ? ".exe" : "");
}

/**
 * Gets the full path (directory + file) to the datasource executable.
 * @param os - operating system
 * @param eecType - eec type; oneagent or activegate
 * @param dataSource - datasource name
 * @returns - full path to the datasource executable
 */
export function getDatasourcePath(os: OsType, eecType: EecType, dataSource: string) {
  return `${getDatasourceDir(os, eecType, dataSource)}${getDatasourceExe(os, eecType, dataSource)}`;
}

/**
 * Checks if the combination of O/S, EEC Type and Datasource is valid.
 * E.g. WMI cannot be simulated on Linux.
 * @param os - operating system
 * @param eecType - type of EEC
 * @param dataSource - datasource name
 * @returns boolean
 */
export function canSimulateDatasource(os: OsType, eecType: EecType, dataSource: string) {
  const DATASOURCES = {
    WINDOWS: {
      ONEAGENT: ["prometheus", "python", "statsd", "wmi"],
      ACTIVEGATE: [
        "prometheus",
        "snmp",
        "snmptraps",
        "sqlOracle",
        "sqlServer",
        "statsd",
        "wmi",
        "python",
      ],
    },
    LINUX: {
      ONEAGENT: ["prometheus", "python", "statsd"],
      ACTIVEGATE: [
        "prometheus",
        "python",
        "snmp",
        "snmptraps",
        "sqlDb2",
        "sqlHana",
        "sqlMySql",
        "sqlOracle",
        "sqlPostgres",
        "sqlServer",
        "sqlSnowflake",
        "statsd",
      ],
    },
  };

  return DATASOURCES[os][eecType].includes(dataSource);
}

/**
 * Parses the extension settings and builds a SimulationConfig object that will be used as default
 * value for any extension simulations. In case of remote locations, some validation is also done
 * on the specified target host.
 * @param context {@link vscode.ExtensionContext}
 * @returns {@link SimulationConfig}
 */
export function loadDefaultSimulationConfig(context: vscode.ExtensionContext): SimulationConfig {
  const fnLogTrace = [...logTrace, "loadDefaultSimulationConfig"];
  // A fallback value in case the user's settings are invalid.
  const fallbackValue: SimulationConfig = {
    eecType: "ONEAGENT",
    location: "LOCAL",
    sendMetrics: false,
  };

  // Process the user's settings
  let target: RemoteTarget | undefined;
  const config = vscode.workspace.getConfiguration("dynatraceExtensions.simulator", null);
  const defaultLocation = config.get<SimulationLocation>("defaultLocation");
  const defaultEecType = config.get<EecType>("defaultEecType");
  const defaultSendMetrics = config.get<boolean>("defaultSendMetrics");

  if (!defaultLocation || !defaultEecType || !defaultSendMetrics) {
    // This should never happen as these are all enums with defaults.
    return fallbackValue;
  }

  // For remote simulation, check the chosen target is valid
  if (defaultLocation === "REMOTE") {
    // Target name is required
    const targetName = config.get<string>("remoteTargetName");
    if (!targetName || targetName === "") {
      logger.error(
        "Invalid default simulator configuration: No target name specified for remote simulation",
        ...fnLogTrace,
      );
      return fallbackValue;
    }
    // Name must match a registered target
    const registeredTargets = getSimulatorTargets(context).filter(t => t.name === targetName);
    if (registeredTargets.length === 0) {
      logger.error(
        `Invalid default simulator configuration: No registered target exists by name "${targetName}"`,
        ...fnLogTrace,
      );
      return fallbackValue;
    }
    // Target specs must match the EEC Type
    target = registeredTargets[0];
    if (target.eecType !== defaultEecType) {
      logger.error(
        `Invalid default simulator configuration: Target "${targetName}" is not registered with EEC Type of ${defaultEecType}`,
        ...fnLogTrace,
      );
      return fallbackValue;
    }
  }

  return {
    eecType: defaultEecType,
    location: defaultLocation,
    sendMetrics: defaultSendMetrics,
    target,
  };
}
