import {
  Button,
  Container,
  DataTable,
  Flex,
  Heading,
  TableColumn,
  TitleBar,
  showToast,
} from "@dynatrace/strato-components-preview";
import { PlusIcon, EditIcon, DeleteIcon, IntegrationsIcon } from "@dynatrace/strato-icons";
import React, { useState } from "react";
import { RemoteTarget, SimulatorPanelData } from "src/app/interfaces/simulator";
import { TargetRegistrationForm } from "./TargetRegistrationForm";

const tableColumns: TableColumn[] = [
  {
    header: "Name",
    accessor: "name",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
  {
    header: "Username",
    accessor: "username",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
  {
    header: "Address",
    accessor: "address",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
  {
    header: "Operating System",
    accessor: "osType",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
  {
    header: "",
    id: "actions",
    autoWidth: true,
    ratioWidth: 1,
    cell: ({ row }) => {
      return (
        <Flex gap={4}>
          <Button onClick={() => console.log("Edit")}>
            <Button.Prefix>
              <EditIcon />
            </Button.Prefix>
          </Button>
          <Button onClick={() => console.log("Delete")}>
            <Button.Prefix>
              <DeleteIcon />
            </Button.Prefix>
          </Button>
        </Flex>
      );
    },
  },
];

interface SimulatorTargetsProps {
  targets: RemoteTarget[];
  setPanelData: (
    newData: SimulatorPanelData | ((prevValue: SimulatorPanelData) => SimulatorPanelData),
  ) => void;
}

export const SimulatorTargets = ({ targets, setPanelData }: SimulatorTargetsProps) => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleOpenModal = () => {
    setModalOpen(true);
  };
  const handleCloseModal = () => {
    setModalOpen(false);
  };

  const addTarget = (target: RemoteTarget) => {
    if (targets.findIndex(t => t.name === target.name) >= 0) {
      showToast({
        type: "critical",
        role: "alert",
        title: "Could not register target",
        message: `A target with name ${target.name} already exists`,
        lifespan: 3000,
      });
    } else {
      setPanelData(prevValue => {
        return {
          dataType: prevValue.dataType,
          data: {
            targets: [...prevValue.data.targets, target],
            summaries: prevValue.data.summaries,
            status: prevValue.data.status,
          },
        };
      });
    }
  };

  return (
    <>
      <Flex flexDirection='column' padding={32} gap={16}>
        <TitleBar>
          <TitleBar.Title>Simulator targets</TitleBar.Title>
          <TitleBar.Subtitle>Manage your target machines for remote simulations</TitleBar.Subtitle>
          <TitleBar.Prefix>
            <Container as={Flex}>
              <IntegrationsIcon size='large' />
            </Container>
          </TitleBar.Prefix>
          <TitleBar.Suffix>
            <Flex gap={4}>
              <Button onClick={handleOpenModal} variant='accent' color='primary'>
                <Button.Prefix>{<PlusIcon />}</Button.Prefix>Add
              </Button>
            </Flex>
          </TitleBar.Suffix>
        </TitleBar>
        <Flex flexDirection='column'>
          <Heading level={2}>Registered ActiveGates</Heading>
          <DataTable columns={tableColumns} data={targets.filter(t => t.eecType === "ACTIVEGATE")}>
            <DataTable.EmptyState>
              {'Click "Add" to register a remote target.'}
            </DataTable.EmptyState>
            <DataTable.Pagination defaultPageSize={5} />
          </DataTable>
        </Flex>
        <Flex flexDirection='column'>
          <Heading level={2}>Registered OneAgents</Heading>
          <DataTable columns={tableColumns} data={targets.filter(t => t.eecType === "ONEAGENT")}>
            <DataTable.EmptyState>
              {'Click "Add" to register a remote target.'}
            </DataTable.EmptyState>
            <DataTable.Pagination defaultPageSize={5} />
          </DataTable>
        </Flex>
      </Flex>
      <TargetRegistrationForm
        modalOpen={modalOpen}
        handleCloseModal={handleCloseModal}
        onSubmit={addTarget}
      />
    </>
  );
};