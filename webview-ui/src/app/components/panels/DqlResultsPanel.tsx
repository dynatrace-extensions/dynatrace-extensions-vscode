/**
  Copyright 2025 Dynatrace LLC

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

import { DqlResultsPanelData, MetricSeries } from "@common";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import {
  TimeseriesChart,
  Timeseries,
  TimeseriesChartConfig,
} from "@dynatrace/strato-components-preview/charts";
import { CodeSnippet, EmptyState } from "@dynatrace/strato-components-preview/content";
import {
  DataTableV2,
  type DataTableV2ColumnDef,
} from "@dynatrace/strato-components-preview/tables";
import React, { useMemo } from "react";

interface DqlResultsPanelProps {
  data: DqlResultsPanelData;
}

const toTimeseriesData = (series: MetricSeries[], query: string): Timeseries[] =>
  series.slice(0, 5).map(({ dimensions, timestamps, values }) => ({
    name: dimensions.length > 0 ? dimensions.join(", ") : query.split("|")[0].trim(),
    datapoints: timestamps.map((ts, i) => {
      const end = new Date(ts);
      const start = i > 0 ? new Date(timestamps[i - 1]) : new Date(ts);
      return { start, end, value: values[i] };
    }),
  }));

export const DqlResultsPanel = ({ data }: DqlResultsPanelProps) => {
  const { dqlQuery, isTimeseries, timeseriesData, records } = data;

  const tableColumns = useMemo<DataTableV2ColumnDef<Record<string, unknown>>[]>(() => {
    const firstRecord = records?.[0];
    if (!firstRecord) return [];
    return Object.keys(firstRecord).map(key => ({
      id: key,
      accessor: key,
      header: key,
      width: "1fr",
    }));
  }, [records]);

  const hasTimeseriesData = isTimeseries && (timeseriesData?.[0]?.data?.length ?? 0) > 0;
  const hasTableData = !isTimeseries && (records?.length ?? 0) > 0;
  const isEmpty = !hasTimeseriesData && !hasTableData;

  return (
    <Flex flexDirection='column' gap={16}>
      <Heading level={1}>DQL Query Results</Heading>
      <Flex flexDirection='column' paddingTop={8}>
        <Text>Query:</Text>
        <CodeSnippet showLineNumbers={false} language='dql'>
          {dqlQuery}
        </CodeSnippet>
      </Flex>
      {isEmpty ? (
        <EmptyState size='small'>
          <EmptyState.Visual>
            <EmptyState.VisualPreset type='no-result' context='query' />
          </EmptyState.Visual>
          <EmptyState.Title>This query returned no results.</EmptyState.Title>
        </EmptyState>
      ) : null}
      {!isEmpty && isTimeseries ? (
        <Flex flexDirection='column'>
          <Text>Timeseries data:</Text>
          <TimeseriesChartConfig value={{ legend: { position: "bottom" } }}>
            <TimeseriesChart data={toTimeseriesData(timeseriesData?.[0].data ?? [], dqlQuery)} />
          </TimeseriesChartConfig>
        </Flex>
      ) : null}
      {!isEmpty && !isTimeseries && (
        <DataTableV2 columns={tableColumns} data={records ?? []} fullWidth />
      )}
    </Flex>
  );
};
