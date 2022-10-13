export const attributeSnippet = `\
- type: ATTRIBUTE
  attribute:
    key: <attribute-key>
    displayName: <attribute-name>`;

export const relationSnippet = `\
- type: RELATION
  relation:
    entitySelectorTemplate: <selector>
    displayName: <relation-name>`;

export const graphChartSnippet = `\
- displayName: <metric-key>
  visualizationType: GRAPH_CHART
  graphChartConfig:
    metrics:
      - metricSelector: <metric-key>:splitBy("dt.entity.<entity-type>")`;

export const chartCardSnippet = `\
- key: <card-key>
  numberOfVisibleCharts: 3
  displayName: <card-name>
  charts: <charts>`;

export const entitiesListCardSnippet = `\
- key: <card-key>
  pageSize: <page-size>
  displayName: <card-name>
  displayCharts: false
  enableDetailsExpandability: true
  numberOfVisibleCharts: 3
  displayIcons: true
  entitySelectorTemplate: <entity-selector>
  hideEmptyCharts: true
  <filtering>
  columns: []
  charts: []`;

export const filteringSnippet = `\
filtering:
    entityFilters:
      - displayName: Filter by
        filters:
          - type: entityName
            displayName: Name
            freeText: true
            modifier: contains
            defaultSearch: true
            distinct: false
            entityTypes:
              - <entity-type>`;

export const entityFilterSnippet = `\
- type: <filter-prop>
  displayName: <filter-name>
  freeText: <free-text>
  modifier: <modifier>
  distinct: <distinct>
  entityTypes:
    - <filtered-entity>`;

export const configActionSnippet = `\
- actionScope: GLOBAL_LIST
  actionLocation: HEADER
  actions:
    - actionExpression: hubExtension|extensionId=<extension-id>|text=configure
      visualization:
        iconOnly: false
        icon: options-menu
        displayName: Configure extension
- actionScope: GLOBAL_DETAILS
  actionLocation: HEADER
  actions:
    - actionExpression: hubExtension|extensionId=<extension-id>|text=configure
      visualization:
        iconOnly: false
        icon: options-menu
        displayName: Configure extension`;

export const screenSnippet = `\
- entityType: <entity-type>
  actions: <configAction>
  listSettings:
    staticContent:
      showGlobalFilter: false
      header:
        title: <entity-name> entities
        description: List of all entities created by the <extension-id> extension
      hideDefaultBreadcrumb: true
      breadcrumbs:
        - type: NOOP
          displayName: Extension 2.0
        - type: NOOP
          displayName: <entity-name>s
    layout:
      autoGenerate: false
      cards:
        - key: <self-list-key>
          type: ENTITIES_LIST
  detailsSettings:
    staticContent:
      showProblems: true
      showProperties: true
      showTags: true
      showGlobalFilter: false
      showAddTag: true
      breadcrumbs:
        - type: NOOP
          displayName: Extension 2.0
        - type: ENTITY_LIST_REF
          entityType: <entity-type>
          displayName: <entity-name>s
    layout:
      autoGenerate: false
      cards: <details-layout-cards>
  chartsCards: <charts-cards>
  entitiesListCards: <entities-list-cards>`;

export const metricMetadataSnippet = `\
- key: <metric-key>
  metadata:
    displayName: <metric-name>
    description: <metric-description>
    unit: <metric-unit>`;