interface SchemaStub {
  schemaId: string;
  latestSchemaVersion: string;
  displayName: string;
}

interface SettingsObject {
  externalId: string;
  schemaId: string;
  schemaVersion: string;
  author: string;
  modified: number;
  updateToken: string;
  objectId: string;
  scope: string;
  value: any;
  summary: string;
  created: number;
}

interface SettingsObjectUpdate {
  schemaVersion?: string;
  updateToken?: string;
  insertAfter?: string;
  insertBefore?: string;
  value: any;
}

interface SettingsObjectCreate {
  externalId?: string;
  schemaId: string;
  schemaVersion?: string;
  insertAfter?: string;
  scope?: string;
  value?: any;
}
