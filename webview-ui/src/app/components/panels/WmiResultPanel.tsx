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

import React, { useMemo } from "react";
import { CodeSnippet } from "@dynatrace/strato-components-preview/content";
import {
  DataTableV2,
  type DataTableV2ColumnDef,
} from "@dynatrace/strato-components-preview/tables";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text, Heading } from "@dynatrace/strato-components/typography";
import { format as sqlFormat } from "sql-formatter";
import { WmiQueryResult } from "@common";

interface WmiResultPanelProps {
  data: WmiQueryResult;
}

export const WmiResultPanel = ({ data }: WmiResultPanelProps) => {
  const { query, results, responseTime } = data;

  const tableColumns = useMemo<DataTableV2ColumnDef<Record<string, string | number>>[]>(
    () =>
      Object.keys(results[0]).map(key => ({
        id: key,
        accessor: key,
        header: key,
        width: "1fr",
      })),
    [results],
  );

  return (
    <Flex flexDirection='column' gap={16}>
      <Heading level={1}>WMI query result</Heading>
      <Flex flexDirection='column' paddingTop={20}>
        <Text textStyle='base-emphasized'>Query:</Text>
        <CodeSnippet showLineNumbers={false} language='sql'>
          {sqlFormat(query)}
        </CodeSnippet>
        <Flex gap={6}>
          <Text textStyle='base-emphasized'>Execution time:</Text>
          <Text>{responseTime}s</Text>
        </Flex>
        <Flex gap={6}>
          <Text textStyle='base-emphasized'>Instances:</Text>
          <Text>{results.length}</Text>
        </Flex>
      </Flex>
      <DataTableV2 sortable fullWidth columns={tableColumns} data={results}>
        <DataTableV2.Pagination defaultPageSize={10} defaultPageIndex={1} />
      </DataTableV2>
    </Flex>
  );
};
