interface SchemaList {
  versions: string[];
}

interface SchemaFiles {
  files: string[];
}

interface MinimalExtension {
  extensionName: string;
  version: string;
}

interface ExtensionMonitoringConfiguration {
  objectId: string;
  scope: string;
  value: MonitoringConfigurationValue;
}

interface MonitoringConfigurationValue {
  enabled: boolean;
  description: string;
  version: string;
  featuresets?: string[];
  vars?: any;
  snmp?: any;
  activationContext?: any;
}

interface ExtensionStatusDto {
  timestamp: number;
  status: "ERROR" | "OK" | "UNKNOWN";
}
