import {
  Button,
  Container,
  DataTable,
  Flex,
  Heading,
  Link,
  ProgressBar,
  ProgressCircle,
  TableColumn,
  TitleBar,
  Tooltip,
} from "@dynatrace/strato-components-preview";
import { Colors } from "@dynatrace/strato-design-tokens";
import {
  ActionIcon,
  DescriptionIcon,
  EditIcon,
  EpicIcon,
  PlayIcon,
  StopIcon,
} from "@dynatrace/strato-icons";
import React, { useState } from "react";
import {
  SIMULATOR_CHECK_READY_CMD,
  SIMULATOR_READ_LOG_CMD,
  SIMULATOR_STOP_CMD,
} from "src/app/constants/constants";
import {
  ExecutionSummary,
  SimulationConfig,
  SimulatorData,
  SimulatorStatus,
} from "src/app/interfaces/simulator";
import { triggerCommand } from "src/app/utils/app-utils";
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
          href={`command:${SIMULATOR_READ_LOG_CMD}?${encodeURIComponent(JSON.stringify(args))}`}
        >
          <Button.Prefix>{<DescriptionIcon />}</Button.Prefix>
        </Button>
      );
    },
  },
];

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
        <Button onClick={() => triggerCommand(SIMULATOR_STOP_CMD)} variant='accent' color='primary'>
          <Button.Prefix>
            <StopIcon />
          </Button.Prefix>
          Stop
        </Button>
      );
    case "READY":
    case "NOTREADY":
      return (
        <Button onClick={handleOpenModal} variant='accent' color='primary'>
          <Button.Prefix>{simulatorStatus === "READY" ? <PlayIcon /> : <EditIcon />}</Button.Prefix>
          {simulatorStatus === "READY" ? "Start" : "Edit config"}
        </Button>
      );
    case "CHECKING":
      return (
        <Button variant='accent' color='primary' disabled={true}>
          <ProgressCircle size='small' />
          Checking
        </Button>
      );
    default:
      return <></>;
  }
};

export const SimulatorExecutions = ({
  summaries,
  status,
  statusMessage,
  targets,
}: SimulatorData) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<SimulationConfig | undefined>(undefined);

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => setModalOpen(false);
  const handleConfigSubmission = (config: SimulationConfig) => {
    setCurrentConfig(config);
    triggerCommand(SIMULATOR_CHECK_READY_CMD, config);
  };

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
            <Tooltip text={statusMessage} disabled={statusMessage === ""} delay='none'>
              <SimulatorButton simulatorStatus={status} handleOpenModal={handleOpenModal} />
            </Tooltip>
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
        onSubmit={handleConfigSubmission}
        targets={targets}
        currentConfig={currentConfig}
        simulatorStatus={status}
        simulatorStatusMessage={statusMessage}
      />
    </>
  );
};
