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

import { WmiQueryResult } from "@common";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text, Heading } from "@dynatrace/strato-components/typography";
import { CodeSnippet } from "@dynatrace/strato-components-preview/content";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components-preview/tables";
import React, { useMemo } from "react";
import { format as sqlFormat } from "sql-formatter";

interface WmiResultPanelProps {
  data: WmiQueryResult;
}

export const WmiResultPanel = ({ data: { query, results, responseTime } }: WmiResultPanelProps) => {
  const tableColumns = useMemo<DataTableColumnDef<Record<string, string | number>>[]>(
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
      <DataTable sortable fullWidth columns={tableColumns} data={results}>
        <DataTable.Pagination defaultPageSize={10} defaultPageIndex={1} />
      </DataTable>
    </Flex>
  );
};
