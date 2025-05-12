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

import { CodeSnippet, DataTable, TableColumn } from "@dynatrace/strato-components-preview";
import { Text, Flex, Heading } from "@dynatrace/strato-components";
import React from "react";
import { format as sqlFormat } from "sql-formatter";
import { WmiQueryResult } from "src/app/interfaces/wmiResultPanel";

interface WmiResultPanelProps {
  data: WmiQueryResult;
}

const resultsToColumns = (results: Record<string, string | number>[]): TableColumn[] => {
  return Object.keys(results[0]).map(key => ({
    header: key,
    accessor: key,
    autoWidth: true,
    ratioWidth: 1,
  }));
};

export const WmiResultPanel = ({ data }: WmiResultPanelProps) => {
  const { query, results, responseTime } = data;

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
      <DataTable columns={resultsToColumns(results)} data={results}>
        <DataTable.Pagination defaultPageSize={10} />
      </DataTable>
    </Flex>
  );
};
