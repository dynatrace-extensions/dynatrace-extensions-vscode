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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Container, Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { ProgressBar } from "@dynatrace/strato-components/content";
import { Button } from "@dynatrace/strato-components/buttons";
import { TitleBar } from "@dynatrace/strato-components-preview/layouts";
import {
  DataTableV2,
  type DataTableV2ColumnDef,
} from "@dynatrace/strato-components-preview/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { ActionIcon, DescriptionIcon, EpicIcon } from "@dynatrace/strato-icons";
import { SimulationConfig, SimulatorData, SimulatorStatus } from "@common";
import { triggerCommand } from "../../utils/app-utils";
import { MandatoryCheckModal } from "./MandatoryCheckModal";
import { SettingsForm } from "./SettingsForm";
import { StateButton, SettingsButton } from "./SimulatorButtons";
import { SimulatorCommand, ExecutionSummary } from "@common";

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

  // Simple callback that sorts execution summaries by start time
  const sortByTimestamp = useCallback((a: ExecutionSummary, b: ExecutionSummary) => {
    if (typeof a.startTime === "string") {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    }
    return b.startTime.getTime() - a.startTime.getTime();
  }, []);

  const tableColumns = useMemo<DataTableV2ColumnDef<ExecutionSummary>[]>(
    () => [
      {
        id: "workspace",
        header: "Workspace",
        accessor: "workspace",
        width: "3fr",
      },
      {
        id: "location",
        header: "Location",
        accessor: "location",
        width: "1fr",
      },
      {
        id: "target",
        header: "Simulated on",
        accessor: "target",
        width: "1fr",
      },
      {
        id: "startTime",
        header: "Start time",
        accessor: "startTime",
        columnType: "date",
        width: "2fr",
      },
      {
        id: "duration",
        header: "Duration",
        accessor: "duration",
        columnType: "number",
        width: "1fr",
      },
      {
        id: "success",
        header: "Success",
        accessor: "success",
        width: "1fr",
        columnType: "text",
        thresholds: [
          {
            accessor: cell => String(cell.success),
            value: "true",
            comparator: "equal-to",
            color: Colors.Charts.Apdex.Excellent.Default,
          },
          {
            accessor: cell => String(cell.success),
            value: "false",
            comparator: "equal-to",
            color: Colors.Charts.Apdex.Unacceptable.Default,
          },
        ],
      },
    ],
    [],
  );

  const tableData = useMemo<ExecutionSummary[]>(
    () => summaries.sort(sortByTimestamp),
    [summaries, sortByTimestamp],
  );

  const handleOpenLog = useCallback((logPath: string) => {
    triggerCommand(SimulatorCommand.ReadLog, [
      JSON.stringify({
        scheme: "file",
        path: logPath,
        authority: "",
      }),
    ]);
  }, []);

  const handleConfigSubmission = (config: SimulationConfig) => {
    setCurrentConfig(config);
    showSettingsModal(false);
    triggerCommand(SimulatorCommand.CheckReady, true, config);
  };

  /** Update state whenever the simulator status changes */
  useEffect(() => {
    if (status === SimulatorStatus.Running) {
      showSettingsModal(false);
      showMandatoryChecksModal(false);
    } else if (status === SimulatorStatus.Ready) {
      showMandatoryChecksModal(false);
    }
  }, [status]);

  return (
    <>
      <Flex flexDirection='column' gap={16} marginTop={16} padding={0}>
        <TitleBar>
          <TitleBar.Title>Simulator executions</TitleBar.Title>
          <TitleBar.Subtitle>
            Browse the results of your previous runs and start new simulations
          </TitleBar.Subtitle>
          <TitleBar.Prefix>
            <Container as={Flex} margin={0} padding={8}>
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
        {status === SimulatorStatus.Running && (
          <ProgressBar>
            <ProgressBar.Label>Simulating extension...</ProgressBar.Label>
            <ProgressBar.Icon>
              <EpicIcon />
            </ProgressBar.Icon>
          </ProgressBar>
        )}
        <Flex flexDirection='column'>
          <Heading level={4}>Simulator execution history</Heading>
          <DataTableV2 sortable fullWidth columns={tableColumns} data={tableData}>
            <DataTableV2.EmptyState>
              {'Click "Start" to start your first simulation'}
            </DataTableV2.EmptyState>
            <DataTableV2.Pagination defaultPageSize={10} defaultPageIndex={1} />
            <DataTableV2.RowActions>
              {(row: ExecutionSummary) => (
                <Button onClick={() => handleOpenLog(row.logPath)}>
                  <Button.Prefix>
                    <DescriptionIcon />
                  </Button.Prefix>
                </Button>
              )}
            </DataTableV2.RowActions>
          </DataTableV2>
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
