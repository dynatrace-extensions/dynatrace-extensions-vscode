// UTILS Related to simulating extensions

import { EecType, OsType } from "../interfaces/simulator";

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