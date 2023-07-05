import {
  CodeSnippet,
  DataTable,
  Flex,
  Heading,
  TableColumn,
  Text,
} from "@dynatrace/strato-components-preview";
import React from "react";
import { WmiQueryResult } from "src/app/interfaces/wmiResultPanel";
import * as sql from "sql-formatter";

interface WmiResultPanelProps {
  data: WmiQueryResult;
}

const resultsToColumns = (results: Record<string, string | number>[]): TableColumn[] => {
  return Object.keys(results[0]).map(key => ({
    header: key,
    accessor: key,
    autoWidth: true,
    ratioWidth: 1
  }));
};

export const WmiResultPanel = ({ data }: WmiResultPanelProps) => {
  const { query, results, responseTime } = data;

  return (
    <Flex flexDirection="column" gap={16}>
      <Heading level={1}>WMI query result</Heading>
      <br />
      <Flex flexDirection="column">
        <Text textStyle="base-emphasized">Query:</Text>
        <CodeSnippet showLineNumbers={false} language="sql">
          {sql.format(query)}
        </CodeSnippet>
        <Flex gap={6}>
          <Text textStyle="base-emphasized">Execution time:</Text>
          <Text>{responseTime}s</Text>
        </Flex>
        <Flex gap={6}>
          <Text textStyle="base-emphasized">Instances:</Text>
          <Text>{results.length}</Text>
        </Flex>
      </Flex>
      <DataTable columns={resultsToColumns(results)} data={results}>
        <DataTable.Pagination defaultPageSize={10} />
      </DataTable>
    </Flex>
  );
};
