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
import { TimeseriesChart, convertToTimeseries } from "@dynatrace/strato-components/charts";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { CodeSnippet, EmptyState } from "@dynatrace/strato-components-preview/content";
// import {
//   DataTableV2,
//   type DataTableV2ColumnDef,
// } from "@dynatrace/strato-components-preview/tables";
import React from "react";

interface DqlResultsPanelProps {
  data: DqlQueryData;
}

export const DqlResultsPanel = ({ data }: DqlResultsPanelProps) => {
  const { dqlQuery, queryResult } = data;

  const hasTimeseriesData =
    dqlQuery.startsWith("timeseries") || dqlQuery.includes("makeTimeseries");
  const isEmpty = queryResult.records.length === 0;

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
      {!isEmpty && hasTimeseriesData ? (
        <TimeseriesChart data={convertToTimeseries(queryResult.records, queryResult.types)} />
      ) : null}
      <CodeSnippet language='json' showLineNumbers={false}>
        {JSON.stringify(queryResult, null, 2)}
      </CodeSnippet>
    </Flex>
  );
};
