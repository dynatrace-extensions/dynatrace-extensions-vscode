import { Button, ProgressCircle, Tooltip } from "@dynatrace/strato-components-preview";
import {
  CriticalIcon,
  PlayIcon,
  SettingIcon,
  StopIcon,
  WarningIcon,
} from "@dynatrace/strato-icons";
import React from "react";
import { SIMULATOR_START_CMD, SIMULATOR_STOP_CMD } from "src/app/constants/constants";
import { SimulationConfig, SimulatorStatus } from "src/app/interfaces/simulator";
import { triggerCommand } from "src/app/utils/app-utils";

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
    case "RUNNING":
      return (
        <Tooltip text='Stop the simulation'>
          <Button
            onClick={() => triggerCommand(SIMULATOR_STOP_CMD)}
            variant='accent'
            color='primary'
          >
            <Button.Prefix>
              <StopIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      );
    case "READY":
      return (
        <Tooltip text='Start the simulation'>
          <Button
            onClick={() => triggerCommand(SIMULATOR_START_CMD, currentConfig)}
            variant='accent'
            color='primary'
          >
            <Button.Prefix>
              <PlayIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      );
    case "NOTREADY":
      return (
        <Tooltip text='There are issues with your simulator configuration. Check your settings.'>
          <Button onClick={() => showSettings(true)} variant='accent' color='warning'>
            <Button.Prefix>
              <WarningIcon />
            </Button.Prefix>
          </Button>
        </Tooltip>
      );
    case "CHECKING":
      return (
        <Tooltip text='Checking your configuration'>
          <Button variant='emphasized' color='primary' disabled>
            <ProgressCircle size='small' />
          </Button>
        </Tooltip>
      );
    case "UNSUPPORTED":
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
