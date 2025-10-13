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

import React, { useMemo, useState } from "react";
import { Container, Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { TitleBar } from "@dynatrace/strato-components-preview/layouts";
import {
  DataTableV2,
  type DataTableV2ColumnDef,
} from "@dynatrace/strato-components-preview/tables";
import { Menu } from "@dynatrace/strato-components-preview/navigation";
import { EmptyState } from "@dynatrace/strato-components-preview/content";
import { PlusIcon, EditIcon, DeleteIcon, ConnectorIcon } from "@dynatrace/strato-icons";
import { triggerCommand } from "../../utils/app-utils";
import { TargetRegistrationForm } from "./TargetRegistrationForm";
import { SimulatorCommand, RemoteTarget, EecType } from "@common";

interface SimulatorTargetsProps {
  targets: RemoteTarget[];
}

/** Simple "+ Add" button shorthand */
const AddButton = ({ onClick }: { onClick: () => void }) => (
  <Button size='condensed' onClick={onClick} variant='accent' color='primary'>
    <Button.Prefix>
      <PlusIcon size='small' />
    </Button.Prefix>
    Add
  </Button>
);

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
  const addTarget = (target: RemoteTarget) => triggerCommand(SimulatorCommand.AddTarget, target);
  const nameIsUnique = (name: string) => targets.findIndex(t => t.name === name) < 0;

  const tableColumns = useMemo<DataTableV2ColumnDef<RemoteTarget>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessor: "name",
      },
      {
        id: "username",
        header: "Username",
        accessor: "username",
      },
      {
        id: "address",
        header: "Address",
        accessor: "address",
      },
      {
        id: "osType",
        header: "Operating System",
        accessor: "osType",
      },
    ],
    [],
  );

  const tableData = useMemo<Record<string, RemoteTarget[]>>(
    () => ({
      OneAgents: targets.filter(t => t.eecType === EecType.OneAgent),
      ActiveGates: targets.filter(t => t.eecType === EecType.ActiveGate),
    }),
    [targets],
  );

  return (
    <>
      <Flex flexDirection='column' width='100%' marginTop={16} padding={0}>
        <TitleBar>
          <TitleBar.Title>Simulator targets</TitleBar.Title>
          <TitleBar.Subtitle>Manage your target machines for remote simulations</TitleBar.Subtitle>
          <TitleBar.Prefix>
            <Container as={Flex} margin={0} padding={8}>
              <ConnectorIcon size='large' />
            </Container>
          </TitleBar.Prefix>
          <TitleBar.Suffix>
            <AddButton onClick={handleOpenModal} />
          </TitleBar.Suffix>
        </TitleBar>
        {Object.entries(tableData).map(([name, data]) => (
          <Flex key={name} flexDirection='column' marginTop={24}>
            <Heading level={4}>Registered {name}</Heading>
            <DataTableV2 sortable fullWidth columns={tableColumns} data={data}>
              <DataTableV2.EmptyState>
                <EmptyState style={{ marginTop: 8 }} size='small'>
                  <EmptyState.Title>No {name} registered</EmptyState.Title>
                  <EmptyState.Details>
                    Click "Add" to register a your host for simulation.
                  </EmptyState.Details>
                  <EmptyState.Actions>
                    <AddButton onClick={handleOpenModal} />
                  </EmptyState.Actions>
                </EmptyState>
              </DataTableV2.EmptyState>
              <DataTableV2.Pagination defaultPageSize={10} defaultPageIndex={1} />
              <DataTableV2.RowActions>
                {(row: RemoteTarget) => (
                  <Menu>
                    <Menu.Content>
                      <Menu.Item onSelect={handleEditTarget.bind(undefined, row)}>
                        <Menu.ItemIcon>
                          <EditIcon />
                        </Menu.ItemIcon>
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        onSelect={triggerCommand.bind(
                          undefined,
                          SimulatorCommand.DeleteTarget,
                          row,
                        )}
                      >
                        <Menu.ItemIcon>
                          <DeleteIcon />
                        </Menu.ItemIcon>
                        Delete
                      </Menu.Item>
                    </Menu.Content>
                  </Menu>
                )}
              </DataTableV2.RowActions>
            </DataTableV2>
          </Flex>
        ))}
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
