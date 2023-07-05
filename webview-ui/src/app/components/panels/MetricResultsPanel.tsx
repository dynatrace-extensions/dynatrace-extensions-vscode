import {
  Heading,
  Flex,
  Text,
  TimeseriesChart,
  Timeseries,
  TimeseriesChartConfig,
  CodeSnippet,
} from "@dynatrace/strato-components-preview";
import React from "react";
import { MetricSeries, MetricSeriesCollection } from "src/app/interfaces/metricResultsPanel";

interface MetricResultsPanelProps {
  data: MetricSeriesCollection[];
}

const toTimeseriesData = (metricData: MetricSeries): Timeseries[] => {
  return [
    {
      name: metricData.dimensions.join(", "),
      datapoints: metricData.timestamps.map((ts, i) => {
        const end = new Date(ts);
        const start = i > 0 ? new Date(metricData.timestamps[i-1]) : new Date(ts);
        return { start, end, value: metricData.values[i] };
      }),
    },
  ];
};

export const MetricResultsPanel = ({ data }: MetricResultsPanelProps) => {
  const { metricId, data: dataSets } = data[0];
  const metricData = dataSets[0];

  return (
    <Flex flexDirection="column" gap={16}>
      <Heading level={1}>Metric selector results</Heading>
      <br />
      <Flex flexDirection="column">
        <Text>Metric selector: </Text>
        <CodeSnippet showLineNumbers={false} language="sql">
          {metricId}
        </CodeSnippet>
      </Flex>
      <TimeseriesChartConfig value={{ legend: { position: "bottom", resizable: false } }}>
        <TimeseriesChart data={toTimeseriesData(metricData)} />
      </TimeseriesChartConfig>
      <Flex flexDirection="column">
        <Text>Dimension map:</Text>
        {Object.entries(metricData.dimensionMap).map(([key, value]) => (
          <Flex key={`${key}-${value}`} marginLeft={20}>
            <Text textStyle="base-emphasized">{key}</Text>
            <Text>{value}</Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
};
