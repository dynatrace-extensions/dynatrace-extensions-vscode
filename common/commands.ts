import { ObjectValues } from "./util-types";

function createCommands<T extends string, U extends Record<string, string>>(
  prefix: T,
  commands: U,
): {
  -readonly [key in keyof U]: `${T}.${U[key]}`;
} {
  return Object.fromEntries(
    Object.entries(commands).map(([key, val]) => [key, `${prefix}.${val}`]),
  ) as never;
}

export const CodeLensCommand = createCommands("dynatrace-extensions.codelens", {
  ScrapeMetrics: "scrapeMetrics",
  ImportMib: "importMib",
  RunWMIQuery: "runWMIQuery",
  ValidateSelector: "validateSelector",
  RunSelector: "runSelector",
} as const);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type CodeLensCommand = ObjectValues<typeof CodeLensCommand>;

export const SimulatorCodeLensCommand = createCommands("dynatraceExtensions.simulator.codelens", {
  Start: "start",
  Stop: "stop",
  Refresh: "refresh",
} as const);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SimulatorCodeLensCommand = ObjectValues<typeof SimulatorCodeLensCommand>;

export const VSCodeCommand = createCommands("vscode", {
  OpenFolder: "openFolder",
  Open: "open",
} as const);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type VSCodeCommand = ObjectValues<typeof VSCodeCommand>;

export const GlobalCommand = createCommands("dynatrace-extensions", {
  LoadSchemas: "loadSchemas",
  InitPending: "initPending",
  InitWorkspace: "initWorkspace",
  OpenScreen: "openScreen",
  DistributeCertificate: "distributeCertificate",
  GenerateCertificates: "generateCertificates",
  ConvertJmxExtension: "convertJmxExtension",
  ConvertPythonExtension: "convertPythonExtension",
  BuildExtension: "buildExtension",
  UploadExtension: "uploadExtension",
  ActivateExtension: "activateExtension",
  CreateDocumentation: "createDocumentation",
  CreateDashboard: "createDashboard",
  CreateAlert: "createAlert",
  CreateMonitoringConfiguration: "createMonitoringConfiguration",
  CreateSmartscapeTopology: "createSmartscapeTopology",
  DownloadSupportArchive: "downloadSupportArchive",
} as const);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type GlobalCommand = ObjectValues<typeof GlobalCommand>;

/**
 * Commands that the Extension Simulator panel can trigger
 */
export const SimulatorCommand = createCommands("dynatrace-extensions.simulator", {
  AddTarget: "addTarget",
  DeleteTarget: "deleteTarget",
  ReadLog: "readLog",
  CheckReady: "checkReady",
  Start: "start",
  Stop: "stop",
  OpenUI: "refreshUI",
} as const);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SimulatorCommand = ObjectValues<typeof SimulatorCommand>;

export const EnvironmentCommandPrefix = "dynatrace-extensions-environments";

export const EnvironmentCommand = createCommands(EnvironmentCommandPrefix, {
  Refresh: "refresh",
  Add: "addEnvironment",
  Use: "useEnvironment",
  Edit: "editEnvironment",
  Delete: "deleteEnvironment",
  ChangeConnection: "changeConnection",
  AddConfig: "addConfig",
  EditConfig: "editConfig",
  DeleteConfig: "deleteConfig",
  SaveConfig: "saveConfig",
  OpenExtension: "openExtension",
} as const);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type EnvironmentCommand = ObjectValues<typeof EnvironmentCommand>;

export const WorkspaceCommandPrefix = "dynatrace-extensions-workspaces";

export const WorkspaceCommand = createCommands(WorkspaceCommandPrefix, {
  Refresh: "refresh",
  Add: "addWorkspace",
  Open: "openWorkspace",
  Delete: "deleteWorkspace",
  EditExtension: "editExtension",
} as const);

export const FastModeCommand = createCommands("dynatrace-extensions-fastmode", {
  OpenOutput: "openOutput",
} as const);
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type FastModeCommand = ObjectValues<typeof FastModeCommand>;
