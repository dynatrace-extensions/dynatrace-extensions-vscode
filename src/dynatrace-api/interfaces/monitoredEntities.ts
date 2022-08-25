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
