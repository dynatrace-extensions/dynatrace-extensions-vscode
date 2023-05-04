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
  value: unknown;
  summary: string;
  created: number;
}

interface SettingsObjectUpdate {
  schemaVersion?: string;
  updateToken?: string;
  insertAfter?: string;
  insertBefore?: string;
  value: unknown;
}

interface SettingsObjectCreate {
  externalId?: string;
  schemaId: string;
  schemaVersion?: string;
  insertAfter?: string;
  scope?: string;
  value?: unknown;
}

export { SettingsObject, SettingsObjectUpdate, SettingsObjectCreate, SchemaStub };
