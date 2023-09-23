import { AppHeader } from "@dynatrace/strato-components-preview";
import React, { useState } from "react";
import { SimulatorPanelData } from "src/app/interfaces/simulator";
import { SimulatorExecutions } from "../extensionSimulator/SimulatorExecutions";
import { SimulatorTargets } from "../extensionSimulator/SimulatorTargets";

interface ExtensionSimulatorProps {
  panelData: SimulatorPanelData;
  setPanelData: (
    newData: SimulatorPanelData | ((prevValue: SimulatorPanelData) => SimulatorPanelData),
  ) => void;
}

export const ExtensionSimulator = ({ panelData, setPanelData }: ExtensionSimulatorProps) => {
  const [page, setPage] = useState("executions");
  const { targets, summaries, status } = panelData.data;

  const handleExecutionsClick = () => {
    setPage("executions");
  };

  const handleTargetsClick = () => {
    setPage("targets");
  };

  return (
    <>
      <AppHeader>
        <AppHeader.NavItems>
          <AppHeader.AppNavLink appName='' href='' />
          <AppHeader.NavItem onClick={handleExecutionsClick} isSelected={page === "executions"}>
            Simulator Executions
          </AppHeader.NavItem>
          <AppHeader.NavItem onClick={handleTargetsClick} isSelected={page === "targets"}>
            Remote Targets
          </AppHeader.NavItem>
        </AppHeader.NavItems>
      </AppHeader>
      {page === "targets" && <SimulatorTargets targets={targets} setPanelData={setPanelData} />}
      {page === "executions" && <SimulatorExecutions summaries={summaries} status={status} />}
    </>
  );
};
