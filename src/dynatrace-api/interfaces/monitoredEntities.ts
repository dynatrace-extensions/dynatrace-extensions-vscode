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

interface EntityTypeList {
  totalCount: number;
  pageSize?: number;
  nextPageKey?: string;
  types: EntityType[];
}

interface EntityType {
  entityLimitExceeded?: boolean;
  fromRelationships?: ToPosition[];
  toRelationships?: FromPosition[];
  tags?: string;
  managementZones?: string;
  dimensionKey?: string;
  displayName?: string;
  properties: EntityTypePropertyDto[];
  type?: string;
}

interface ToPosition {
  toTypes?: string[];
  id?: string;
}

interface FromPosition {
  fromTypes?: string[];
  id?: string;
}

interface EntityTypePropertyDto {
  displayName?: string;
  id: string;
  type?: string;
}

interface EntityId {
  id: string;
  type: string;
}

interface METag {
  stringRepresentation: string;
  key: string;
  value: string;
  context: string;
}

interface ManagementZone {
  name: string;
  id: string;
}

interface EntityIcon {
  primaryIconType?: string;
  secondaryIconType?: string;
  customIconPath?: string;
}

interface Entity {
  firstSeenTms: number;
  lastSeenTms: number;
  fromRelationships?: { [key: string]: EntityId[] };
  toRelationships?: { [key: string]: EntityId[] };
  tags?: METag[];
  managementZones?: ManagementZone[];
  entityId: string;
  icon?: EntityIcon;
  properties?: { [key: string]: string }[];
  type: string;
  displayName: string;
}
