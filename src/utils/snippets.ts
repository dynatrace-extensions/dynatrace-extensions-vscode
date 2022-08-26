export const attributeSnippet = `\
- type: ATTRIBUTE
  attribute:
    key: <attribute-key>
    displayName: <attribute-name>`;

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
  charts:
<charts>`;
