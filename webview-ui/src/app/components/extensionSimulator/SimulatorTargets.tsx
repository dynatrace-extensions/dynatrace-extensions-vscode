import {
  Button,
  Container,
  DataTable,
  Flex,
  Heading,
  Modal,
  TableColumn,
  TitleBar,
} from "@dynatrace/strato-components-preview";
import { PlusIcon, EditIcon, DeleteIcon, IntegrationsIcon } from "@dynatrace/strato-icons";
import React, { useState } from "react";
import { SimulatorPanelData } from "src/app/interfaces/simulator";
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
    header: "Address",
    accessor: "address",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
  {
    header: "EEC Type",
    accessor: "eecType",
    autoWidth: true,
    ratioWidth: 1,
    columnType: "text",
  },
];

interface SimulatorTargetsProps {
  panelData: SimulatorPanelData;
  setPanelData: (
    newData: SimulatorPanelData | ((prevValue: SimulatorPanelData) => SimulatorPanelData),
  ) => void;
}

export const SimulatorTargets = ({ panelData, setPanelData }: SimulatorTargetsProps) => {
  // State Variables
  const [modalViewState, setModalViewState] = useState(false);

  return (
    <Flex flexDirection='column' alignItems='center' padding={32}>
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
            <Button
              data-testid='open-modal-button'
              onClick={() => setModalViewState(true)}
              variant='emphasized'
            >
              <Button.Prefix>{<PlusIcon />}</Button.Prefix>Add
            </Button>
            <Button variant='default'>
              <Button.Prefix>{<EditIcon />}</Button.Prefix>Edit
            </Button>
            <Button variant='default'>
              <Button.Prefix>{<DeleteIcon />}</Button.Prefix>Delete
            </Button>
          </Flex>
        </TitleBar.Suffix>
      </TitleBar>
      <Modal
        title='Add Remote Target'
        show={modalViewState}
        size='small'
        onDismiss={() => setModalViewState(false)}
      >
        <TargetRegistrationForm setPanelData={setPanelData} setModalViewState={setModalViewState} />
      </Modal>

      <Heading level={2}>Configured Remote Endpoints</Heading>
      <DataTable columns={tableColumns} data={panelData.data.targets} fullWidth />
    </Flex>
  );
};
