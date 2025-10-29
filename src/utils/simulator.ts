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

import { EecType, OsType, RemoteTarget, SimulationConfig, SimulationLocation } from "@common";
import vscode from "vscode";
import { getSimulatorTargets } from "./fileSystem";
import logger from "./logging";

const logTrace = ["utils", "simulator"];

/**
 * Gets the default directory where the specified datasource .exe is located.
 * @param os - operating system
 * @param eecType - eec type; oneagent or activegate
 * @param dataSource - datasource name
 * @returns - directory path
 */
export function getDatasourceDir(os: OsType, eecType: EecType, dataSource: string) {
  const eec = eecType === EecType.OneAgent ? "oneagent" : "remotepluginmodule";
  const datasourceDir =
    os === OsType.Windows
      ? `C:\\Program Files\\dynatrace\\${eec}\\agent\\datasources\\${dataSource}\\`
      : `/opt/dynatrace/${eec}/agent/datasources/${dataSource}/`;

  logger.debug(`Datasource directory is: ${datasourceDir}`, ...logTrace, "getDatasourceDir");

  return datasourceDir;
}

/**
 * Gets the name of the datasource executable file.
 * @param eecType - eec type; oneagent or activegate
 * @param dataSource - datasource name
 * @returns name of the file
 */
export function getDatasourceExe(os: OsType, eecType: EecType, dataSource: string) {
  const exePrefix = eecType === EecType.OneAgent ? "oneagent" : "dynatrace";
  const datasourceExe = `${exePrefix}source${dataSource}` + (os === OsType.Windows ? ".exe" : "");

  logger.debug(`Datasource exe is: ${datasourceExe}`, ...logTrace, "getDatasourceExe");

  return datasourceExe;
}

/**
 * Gets the full path (directory + file) to the datasource executable.
 * @param os - operating system
 * @param eecType - eec type; oneagent or activegate
 * @param dataSource - datasource name
 * @returns - full path to the datasource executable
 */
export function getDatasourcePath(os: OsType, eecType: EecType, dataSource: string) {
  const datasourcePath = `${getDatasourceDir(os, eecType, dataSource)}${getDatasourceExe(
    os,
    eecType,
    dataSource,
  )}`;
  logger.debug(`Datasource path is: ${datasourcePath}`, ...logTrace, "getDatasourcePath");
  return datasourcePath;
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
    [OsType.Windows]: {
      [EecType.OneAgent]: ["prometheus", "python", "statsd", "wmi"],
      [EecType.ActiveGate]: [
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
    [OsType.Linux]: {
      [EecType.OneAgent]: ["prometheus", "python", "statsd"],
      [EecType.ActiveGate]: [
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

  const result = DATASOURCES[os][eecType].includes(dataSource);

  logger.debug(
    `Can we simulate ${dataSource} on ${os} ${eecType}? ${String(result)}`,
    ...logTrace,
    "canSimulateDatasource",
  );

  return result;
}

/**
 * Parses the extension settings and builds a SimulationConfig object that will be used as default
 * value for any extension simulations. In case of remote locations, some validation is also done
 * on the specified target host.
 * @returns {@link SimulationConfig}
 */
export function loadDefaultSimulationConfig(): SimulationConfig {
  const fnLogTrace = [...logTrace, "loadDefaultSimulationConfig"];
  // A fallback value in case the user's settings are invalid.
  const fallbackValue: SimulationConfig = {
    eecType: EecType.OneAgent,
    location: SimulationLocation.Local,
    sendMetrics: false,
  };

  // Process the user's settings
  let target: RemoteTarget | undefined;
  const config = vscode.workspace.getConfiguration("dynatraceExtensions.simulator", null);
  const defaultLocation = config.get<SimulationLocation>("defaultLocation");
  const defaultEecType = config.get<EecType>("defaultEecType");
  const defaultSendMetrics = config.get<boolean>("defaultMetricsIngestion");

  if (
    defaultLocation === undefined ||
    defaultEecType === undefined ||
    defaultSendMetrics === undefined
  ) {
    // This should never happen as these are all enums with defaults.
    logger.warn(
      "Default config options not found. Falling back to hardcoded value.",
      ...fnLogTrace,
    );
    return fallbackValue;
  }

  // For remote simulation, check the chosen target is valid
  if (defaultLocation === SimulationLocation.Remote) {
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
    const registeredTargets = getSimulatorTargets().filter(t => t.name === targetName);
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

  const defaultConfig = {
    eecType: defaultEecType,
    location: defaultLocation,
    sendMetrics: defaultSendMetrics,
    target,
  };

  logger.debug(
    `Loaded default simulation config as ${JSON.stringify(defaultConfig)}`,
    ...fnLogTrace,
  );

  return defaultConfig;
}
