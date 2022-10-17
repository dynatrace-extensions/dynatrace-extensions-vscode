interface Dashboard {
    metadata?: ConfigurationMetadata;
    id?: string;
    dashboardMetadata: DashboardMetadata;
    tiles: any[];
}

interface ConfigurationMetadata{
    configurationVersions?: number[];
    currentConfigurationVersions?: string[];
    clusterVersion?: string;
}

interface DashboardMetadata{
    name: string;
    shared?: boolean;
    owner: string;
    dashboardFilter?: DashboardFilter;
    tags?: string[];
    preset?: boolean;
    dynamicFilters?: DynamicFilters;
    tilesNameSize?: "small" | "medium" | "large";
    hasConsistentColors?: boolean;
}

interface DashboardFilter {
    timeframe?: string;
    managementZone?: EntityShortRepresentation;
}

interface EntityShortRepresentation {
    id: string,
    name?: string,
    description?: string;
}

interface DynamicFilters {
    filters: string[];
    tagSuggestionTypes?: string[];
}