import {
  Button,
  Container,
  DataTable,
  Flex,
  Heading,
  Link,
  TableColumn,
  TitleBar,
} from "@dynatrace/strato-components-preview";
import { ActionIcon, PauseIcon, PlayIcon, RefreshIcon } from "@dynatrace/strato-icons";
import React from "react";
import { SimulatorPanelData } from "src/app/interfaces/simulator";

const tableColumns: TableColumn[] = [
  {
    header: "Location",
    accessor: "location",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
  {
    header: "Simulated on",
    accessor: "target",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
  {
    header: "Start time",
    accessor: "startTime",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "date",
  },
  {
    header: "Duration",
    accessor: "duration",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "number",
  },
  {
    header: "Success",
    accessor: "success",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
];

interface SimulatorExecutionsProps {
  panelData: SimulatorPanelData;
}

export const SimulatorExecutions = ({ panelData }: SimulatorExecutionsProps) => {
  const { summaries, status } = panelData.data;

  const getSimulatorCommandUri = (command: "START" | "STOP" | "CHECK") => {
    switch (command) {
      case "START":
        return "command:dynatrace-extensions.simulator.start";
      case "STOP":
        return "command:dynatrace-extensions.simulator.stop";
      case "CHECK":
        return "command:dynatrace-extensions.simulator.checkReady";
    }
  };

  const SimulatorButton = () => {
    switch (status) {
      case "READY":
        return (
          <Button
            as={Link}
            style={{ textDecoration: "none" }}
            href={getSimulatorCommandUri("START")}
            variant='emphasized'
          >
            <Button.Prefix>{<PlayIcon />}</Button.Prefix>Start
          </Button>
        );
      case "NOTREADY":
        return (
          <Button
            as={Link}
            style={{ textDecoration: "none" }}
            href={getSimulatorCommandUri("CHECK")}
            variant='emphasized'
          >
            <Button.Prefix>{<RefreshIcon />}</Button.Prefix>Check status
          </Button>
        );
      case "RUNNING":
        return (
          <Button
            as={Link}
            style={{ textDecoration: "none" }}
            href={getSimulatorCommandUri("STOP")}
            variant='emphasized'
          >
            <Button.Prefix>{<PauseIcon />}</Button.Prefix>Stop
          </Button>
        );
    }
  };

  return (
    <Flex flexDirection='column' gap={16}>
      <TitleBar>
        <TitleBar.Title>Simulator executions</TitleBar.Title>
        <TitleBar.Subtitle>
          Browse the results of your previous runs and start new simulations
        </TitleBar.Subtitle>
        <TitleBar.Prefix>
          <Container as={Flex}>
            <ActionIcon size='large' />
          </Container>
        </TitleBar.Prefix>
        <TitleBar.Suffix>
          <SimulatorButton />
        </TitleBar.Suffix>
      </TitleBar>
      <Flex flexDirection='column'>
        <Heading level={2}>Previous simulator runs</Heading>
        <DataTable columns={tableColumns} data={summaries} />
      </Flex>
    </Flex>
  );
};
