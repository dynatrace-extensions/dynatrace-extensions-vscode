import {
  Button,
  Container,
  DataTable,
  Flex,
  Heading,
  Link,
  ProgressBar,
  TableColumn,
  TitleBar,
} from "@dynatrace/strato-components-preview";
import { Colors } from "@dynatrace/strato-design-tokens";
import {
  ActionIcon,
  DescriptionIcon,
  EpicIcon,
  PlayIcon,
  RefreshIcon,
  StopIcon,
} from "@dynatrace/strato-icons";
import React, { useState } from "react";
import { ExecutionSummary, RemoteTarget, SimulatorStatus } from "src/app/interfaces/simulator";
import { NewExecutionForm } from "./NewExecutionForm";

const tableColumns: TableColumn[] = [
  {
    header: "Workspace",
    accessor: "workspace",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
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
    thresholds: [
      {
        value: "true",
        comparator: "equal-to",
        color: Colors.Charts.Apdex.Excellent.Default,
      },
      {
        value: "false",
        comparator: "equal-to",
        color: Colors.Charts.Apdex.Unacceptable.Default,
      },
    ],
  },
  {
    header: "",
    id: "actions",
    autoWidth: true,
    ratioWidth: 1,
    cell: ({ row }) => {
      const fileUri = {
        scheme: "file",
        path: (row.original as ExecutionSummary).logPath,
        authority: "",
      };
      const args = [JSON.stringify(fileUri)];
      return (
        <Button
          as={Link}
          style={{ textDecoration: "none" }}
          href={`command:dynatrace-extensions.simulator.readLog?${encodeURIComponent(
            JSON.stringify(args),
          )}`}
        >
          <Button.Prefix>{<DescriptionIcon />}</Button.Prefix>
        </Button>
      );
    },
  },
];

interface SimulatorExecutionsProps {
  summaries: ExecutionSummary[];
  status: SimulatorStatus;
  targets: RemoteTarget[];
}

const SimulatorButton = ({
  simulatorStatus,
  handleOpenModal,
}: {
  simulatorStatus: SimulatorStatus;
  handleOpenModal: () => void;
}) => {
  switch (simulatorStatus) {
    case "RUNNING":
      return (
        <Button
          as={Link}
          style={{ textDecoration: "none" }}
          variant='accent'
          color='primary'
          href='command:dynatrace-extensions.simulator.stop'
        >
          <Button.Prefix>
            <StopIcon />
          </Button.Prefix>
          Stop
        </Button>
      );
    case "READY":
      return (
        <Button onClick={handleOpenModal} variant='accent' color='primary'>
          <Button.Prefix>
            <PlayIcon />
          </Button.Prefix>
          Start
        </Button>
      );
    case "NOTREADY":
      return (
        <Button
          as={Link}
          style={{ textDecoration: "none" }}
          variant='accent'
          color='primary'
          href='command:dynatrace-extensions.simulator.checkReady'
        >
          <Button.Prefix>
            <RefreshIcon />
          </Button.Prefix>
          Check again
        </Button>
      );
    default:
      return <></>;
  }
};

export const SimulatorExecutions = ({ summaries, status, targets }: SimulatorExecutionsProps) => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);

  return (
    <>
      <Flex flexDirection='column' gap={16} padding={32}>
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
            <SimulatorButton simulatorStatus={status} handleOpenModal={handleOpenModal} />
          </TitleBar.Suffix>
        </TitleBar>
        {status === "RUNNING" && (
          <ProgressBar>
            <ProgressBar.Label>Simulating extension...</ProgressBar.Label>
            <ProgressBar.Icon>
              <EpicIcon />
            </ProgressBar.Icon>
          </ProgressBar>
        )}
        <Flex flexDirection='column'>
          <Heading level={2}>Simulator execution history</Heading>
          <DataTable
            columns={tableColumns}
            data={summaries.sort((a, b) => {
              if (typeof a.startTime === "string") {
                return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
              }
              return b.startTime.getTime() - a.startTime.getTime();
            })}
          >
            <DataTable.EmptyState>
              {'Click "Start" to start your first simulation'}
            </DataTable.EmptyState>
            <DataTable.Pagination defaultPageSize={10} />
          </DataTable>
        </Flex>
      </Flex>
      <NewExecutionForm
        modalOpen={modalOpen}
        handleCloseModal={handleCloseModal}
        onSubmit={() => {}}
        targets={targets}
      />
    </>
  );
};
