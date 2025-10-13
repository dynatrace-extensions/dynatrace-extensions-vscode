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

import { Button, ProgressCircle } from "@dynatrace/strato-components";
import { Tooltip } from "@dynatrace/strato-components-preview";
import {
  CriticalIcon,
  PlayIcon,
  SettingIcon,
  StopIcon,
  WarningIcon,
} from "@dynatrace/strato-icons";
import React from "react";
import { SimulationConfig, SimulatorStatus, SimulatorCommand } from "@common";
import { triggerCommand } from "../../utils/app-utils";

interface StateButtonProps {
  currentConfig: SimulationConfig | undefined;
  simulatorStatus: SimulatorStatus;
  showSettings: (state: boolean) => void;
  showMandatoryChecks: (state: boolean) => void;
}

export const StateButton = ({
  currentConfig,
  simulatorStatus,
  showSettings,
  showMandatoryChecks,
}: StateButtonProps) => {
  switch (simulatorStatus) {
    case SimulatorStatus.Running:
      return (
        <Tooltip text='Stop the simulation'>
          <Button
            onClick={() => triggerCommand(SimulatorCommand.Stop)}
            variant='accent'
            color='primary'
          >
            <Button.Prefix>
              <StopIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      );
    case SimulatorStatus.Ready:
      return (
        <Tooltip text='Start the simulation'>
          <Button
            onClick={() => triggerCommand(SimulatorCommand.Start, currentConfig)}
            variant='accent'
            color='primary'
          >
            <Button.Prefix>
              <PlayIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      );
    case SimulatorStatus.NotReady:
      return (
        <Tooltip text='There are issues with your simulator configuration. Check your settings.'>
          <Button onClick={() => showSettings(true)} variant='accent' color='warning'>
            <Button.Prefix>
              <WarningIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      );
    case SimulatorStatus.Checking:
      return (
        <Tooltip text='Checking your configuration'>
          <Button variant='emphasized' color='primary' disabled>
            <ProgressCircle size='small' />
          </Button>
        </Tooltip>
      );
    case SimulatorStatus.Unsupported:
      return (
        <Tooltip text="One or more mandatory settings are not defined. Click to see what's wrong.">
          <Button onClick={() => showMandatoryChecks(true)} variant='accent' color='critical'>
            <Button.Prefix>
              <CriticalIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      );
    default:
      return <></>;
  }
};

export const SettingsButton = ({ showSettings }: { showSettings: (state: boolean) => void }) => (
  <Tooltip text='Settings'>
    <Button onClick={() => showSettings(true)} variant='default' color='primary'>
      <Button.Prefix>
        <SettingIcon />
      </Button.Prefix>
    </Button>
  </Tooltip>
);
