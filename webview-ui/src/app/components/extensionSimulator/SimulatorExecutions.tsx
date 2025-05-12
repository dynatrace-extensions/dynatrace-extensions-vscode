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

import { Button, Container, Flex, Heading, Link, ProgressBar } from "@dynatrace/strato-components";
import { TableColumn, TitleBar, DataTable } from "@dynatrace/strato-components-preview";
import { Colors } from "@dynatrace/strato-design-tokens";
import { ActionIcon, DescriptionIcon, EpicIcon } from "@dynatrace/strato-icons";
import React, { useEffect, useState } from "react";
import { SIMULATOR_CHECK_READY_CMD, SIMULATOR_READ_LOG_CMD } from "../../constants/constants";
import { ExecutionSummary, SimulationConfig, SimulatorData } from "../../interfaces/simulator";
import { triggerCommand } from "../../utils/app-utils";
import { MandatoryCheckModal } from "./MandatoryCheckModal";
import { SettingsForm } from "./SettingsForm";
import { StateButton, SettingsButton } from "./SimulatorButtons";

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
    cell: ({ row }: { row: { original: unknown } }) => {
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

export const SimulatorExecutions = ({
  summaries,
  status,
  statusMessage,
  failedChecks,
  currentConfiguration,
  specs,
  targets,
}: SimulatorData) => {
  const [settingsModal, showSettingsModal] = useState(false);
  const [mandatoryChecks, showMandatoryChecksModal] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<SimulationConfig>(currentConfiguration);

  const handleConfigSubmission = (config: SimulationConfig) => {
    setCurrentConfig(config);
    showSettingsModal(false);
    triggerCommand(SIMULATOR_CHECK_READY_CMD, true, config);
  };

  useEffect(() => {
    if (status === "RUNNING") {
      showSettingsModal(false);
      showMandatoryChecksModal(false);
    } else if (status === "READY") {
      showMandatoryChecksModal(false);
    }
  }, [status]);

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
            <Flex gap={4}>
              <StateButton
                currentConfig={currentConfig}
                simulatorStatus={status}
                showSettings={showSettingsModal}
                showMandatoryChecks={showMandatoryChecksModal}
              />
              <SettingsButton showSettings={showSettingsModal} />
            </Flex>
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
      <MandatoryCheckModal
        modalOpen={mandatoryChecks}
        setModalOpen={showMandatoryChecksModal}
        failedChecks={failedChecks}
      />
      <SettingsForm
        modalOpen={settingsModal}
        setModalOpen={showSettingsModal}
        onSubmit={handleConfigSubmission}
        targets={targets}
        currentConfig={currentConfig}
        simulatorStatus={status}
        simulatorStatusMessage={statusMessage}
        specs={specs}
      />
    </>
  );
};
