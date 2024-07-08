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

import {
  Button,
  Container,
  DataTable,
  Flex,
  Heading,
  TableColumn,
  TitleBar,
} from "@dynatrace/strato-components-preview";
import { PlusIcon, EditIcon, DeleteIcon, ConnectorIcon } from "@dynatrace/strato-icons";
import React, { useState } from "react";
import {
  SIMULATOR_ADD_TARGERT_CMD,
  SIMULATOR_DELETE_TARGERT_CMD,
} from "src/app/constants/constants";
import { RemoteTarget } from "src/app/interfaces/simulator";
import { triggerCommand } from "src/app/utils/app-utils";
import { TargetRegistrationForm } from "./TargetRegistrationForm";

interface SimulatorTargetsProps {
  targets: RemoteTarget[];
}

export const SimulatorTargets = ({ targets }: SimulatorTargetsProps) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<RemoteTarget | undefined>(undefined);

  const handleOpenModal = () => setModalOpen(true);
  const handleCloseModal = () => {
    setEditingTarget(undefined);
    setModalOpen(false);
  };
  const handleEditTarget = (target: RemoteTarget) => {
    setEditingTarget(target);
    handleOpenModal();
  };
  const addTarget = (target: RemoteTarget) => triggerCommand(SIMULATOR_ADD_TARGERT_CMD, target);
  const nameIsUnique = (name: string) => targets.findIndex(t => t.name === name) < 0;

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
      cell: ({ row }: { row: { original: unknown } }) => {
        return (
          <Flex gap={4}>
            <Button onClick={() => handleEditTarget(row.original as RemoteTarget)}>
              <Button.Prefix>
                <EditIcon />
              </Button.Prefix>
            </Button>
            <Button onClick={() => triggerCommand(SIMULATOR_DELETE_TARGERT_CMD, row.original)}>
              <Button.Prefix>
                <DeleteIcon />
              </Button.Prefix>
            </Button>
          </Flex>
        );
      },
    },
  ];

  return (
    <>
      <Flex flexDirection='column' padding={32} gap={16}>
        <TitleBar>
          <TitleBar.Title>Simulator targets</TitleBar.Title>
          <TitleBar.Subtitle>Manage your target machines for remote simulations</TitleBar.Subtitle>
          <TitleBar.Prefix>
            <Container as={Flex}>
              <ConnectorIcon size='large' />
            </Container>
          </TitleBar.Prefix>
          <TitleBar.Suffix>
            <Flex gap={4}>
              <Button onClick={() => handleOpenModal()} variant='accent' color='primary'>
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
        <br />
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
        nameIsUnique={nameIsUnique}
        editingTarget={editingTarget}
      />
    </>
  );
};
