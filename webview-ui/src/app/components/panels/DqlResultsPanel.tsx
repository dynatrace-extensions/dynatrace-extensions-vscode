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

import { DqlQueryData } from "@common";
import { Button } from "@dynatrace/strato-components/buttons";
import { TimeseriesChart, convertToTimeseries } from "@dynatrace/strato-components/charts";
import { Flex } from "@dynatrace/strato-components/layouts";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { CodeSnippet, EmptyState } from "@dynatrace/strato-components-preview/content";
import { HideIcon, ViewIcon } from "@dynatrace/strato-icons";
import React, { useMemo, useState } from "react";

interface DqlResultsPanelProps {
  data: DqlQueryData;
}

type FieldType =
  | "boolean"
  | "string"
  | "double"
  | "long"
  | "timestamp"
  | "timeframe"
  | "duration"
  | "binary"
  | "ip_address"
  | "geo_point"
  | "array"
  | "record"
  | "uid"
  | "smartscape_id"
  | "undefined";

type ColumnType =
  | "number"
  | "text"
  | "datetime"
  | "date"
  | "bit"
  | "long"
  | "currency"
  | "sparkline"
  | "meterbar"
  | "gantt"
  | "markdown"
  | "log-content"
  | undefined;

const getColumnType = (fieldType?: FieldType): ColumnType => {
  if (!fieldType) {
    return undefined;
  }
  switch (fieldType) {
    case "boolean":
    case "string":
    case "binary":
    case "ip_address":
    case "geo_point":
    case "array":
    case "record":
    case "uid":
    case "smartscape_id":
      return "text";
    case "double":
    case "duration":
      return "number";
    case "long":
      return "long";
    case "timestamp":
    case "timeframe":
      return "datetime";
    default:
      return undefined;
  }
};

export const DqlResultsPanel = ({ data }: DqlResultsPanelProps) => {
  const [showRaw, setShowRaw] = useState(false);
  const { dqlQuery, queryResult } = data;

  const hasTimeseriesData =
    dqlQuery.startsWith("timeseries") || dqlQuery.includes("makeTimeseries");
  const isEmpty = queryResult.records.length === 0;

  const tableColumns = useMemo<DataTableColumnDef<Record<string, unknown>>[]>(() => {
    const columns: DataTableColumnDef<Record<string, unknown>>[] = [];
    queryResult.types.forEach(t =>
      Object.entries(t.mappings).forEach(([alias, mType]) => {
        columns.push({
          id: alias,
          header: alias,
          accessor: alias,
          columnType: getColumnType(mType?.type),
        });
      }),
    );
    return columns;
  }, [queryResult.types]);

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
      ) : (
        <Flex flexDirection='column' paddingTop={8}>
          <Text>Results:</Text>
          {!isEmpty && hasTimeseriesData ? (
            <TimeseriesChart data={convertToTimeseries(queryResult.records, queryResult.types)} />
          ) : null}
          {!isEmpty && !hasTimeseriesData && (
            <DataTable fullWidth columns={tableColumns} data={queryResult.records} />
          )}
        </Flex>
      )}
      <Flex flexDirection='column' paddingTop={8}>
        <Button onClick={() => setShowRaw(!showRaw)}>
          <Button.Prefix>{showRaw ? <HideIcon /> : <ViewIcon />}</Button.Prefix>
          <Button.Label>{showRaw ? "Hide" : "Show"} raw results</Button.Label>
        </Button>
        {!!showRaw && (
          <CodeSnippet language='json' showLineNumbers={false}>
            {JSON.stringify(queryResult, null, 2)}
          </CodeSnippet>
        )}
      </Flex>
    </Flex>
  );
};
