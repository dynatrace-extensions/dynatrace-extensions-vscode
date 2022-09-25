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
