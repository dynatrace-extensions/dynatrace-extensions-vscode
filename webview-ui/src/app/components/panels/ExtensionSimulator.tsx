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

import { AppHeader } from "@dynatrace/strato-components-preview";
import React, { useState } from "react";
import { SimulatorData } from "src/app/interfaces/simulator";
import { SimulatorExecutions } from "../extensionSimulator/SimulatorExecutions";
import { SimulatorTargets } from "../extensionSimulator/SimulatorTargets";

interface ExtensionSimulatorProps {
  data: SimulatorData;
}

export const ExtensionSimulator = ({ data }: ExtensionSimulatorProps) => {
  const [page, setPage] = useState("executions");
  const { targets } = data;

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
      {page === "targets" && <SimulatorTargets targets={targets} />}
      {page === "executions" && <SimulatorExecutions {...data} />}
    </>
  );
};
