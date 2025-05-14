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
  Modal,
  showToast,
  FieldSet,
  FormField,
  RadioGroup,
  Radio,
  Switch,
  SelectV2,
  Label,
} from "@dynatrace/strato-components-preview";
import { Flex, Container, Text, Button } from "@dynatrace/strato-components";
import { WarningIcon } from "@dynatrace/strato-icons";
import React, { useEffect, useState } from "react";
import { UseFormRegister, useForm } from "react-hook-form";
import {
  EecType,
  RemoteTarget,
  SimulationConfig,
  SimulationLocation,
  SimulationSpecs,
  SimulatorStatus,
} from "../../interfaces/simulator";

interface RemoteTargetsFieldSetProps {
  targets: RemoteTarget[];
  eecType: EecType;
  selectedId: string | null;
  register: UseFormRegister<ExecutionForm>;
  onChange: (value: string | null) => void;
  controlState: {
    state: "valid" | "error";
    hint: string | undefined;
  };
}

const RemoteTargetsFieldSet = ({
  targets,
  eecType,
  selectedId,
  controlState,
  onChange,
  register,
}: RemoteTargetsFieldSetProps) => {
  const filteredTargets = targets.filter(t => t.eecType === eecType);

  return filteredTargets.length === 0 ? (
    <Container variant='default' color='critical'>
      <Flex gap={12}>
        <WarningIcon />
        <Text>No matching targets available.</Text>
      </Flex>
    </Container>
  ) : (
    <FormField required>
      <Label>Select a target</Label>
      <SelectV2
        {...register("target", { required: { value: true, message: "Please select a target" } })}
        name='target'
        value={selectedId}
        onChange={onChange}
        controlState={controlState}
      >
        <SelectV2.Content>
          {filteredTargets.map(t => (
            <SelectV2.Option key={t.name} id={t.name} value={t.name}>
              {`${t.name} (${t.username}@${t.address})`}
            </SelectV2.Option>
          ))}
        </SelectV2.Content>
      </SelectV2>
    </FormField>
  );
};

type ExecutionForm = {
  location: SimulationLocation;
  eecType: EecType;
  target?: string;
  sendMetrics: boolean;
};

interface SettingsFormProps {
  modalOpen: boolean;
  setModalOpen: (state: boolean) => void;
  onSubmit: (config: SimulationConfig) => void;
  targets: RemoteTarget[];
  currentConfig?: SimulationConfig;
  simulatorStatus: SimulatorStatus;
  simulatorStatusMessage: string;
  specs: SimulationSpecs;
}

export const SettingsForm = ({
  modalOpen,
  setModalOpen,
  onSubmit,
  targets,
  specs,
  currentConfig,
  simulatorStatus,
  simulatorStatusMessage,
}: SettingsFormProps) => {
  const [location, setLocation] = useState<SimulationLocation>(
    !specs.localActiveGateDsExists && !specs.localOneAgentDsExists ? "REMOTE" : "LOCAL",
  );
  const [eecType, setEecType] = useState<EecType>(
    specs.dsSupportsOneAgentEec ? "ONEAGENT" : "ACTIVEGATE",
  );
  const [target, setTarget] = useState<string | null>(null);
  const [sendMetrics, setSendMetrics] = useState(false);

  useEffect(() => {
    if (currentConfig) {
      setLocation(currentConfig.location);
      setEecType(currentConfig.eecType);
      setTarget(currentConfig.target ? currentConfig.target.name : null);
      setSendMetrics(currentConfig.sendMetrics);
    }
  }, [currentConfig]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ExecutionForm>({ mode: "all" });

  const createConfig = (): [SimulationConfig | undefined, string] => {
    if (location === "REMOTE" && (target === null || target[0] === "")) {
      return [undefined, "Must select a target for remote simulation"];
    }

    // TODO - check target reachable or other incompatibilities?

    return [
      {
        location,
        eecType,
        target: targets.find(t => t.name === target),
        sendMetrics,
      },
      "",
    ];
  };

  const clearForm = () => {
    setLocation("LOCAL");
    setEecType("ONEAGENT");
    setTarget(null);
  };

  const handleSubmitClick = () => {
    const [config, errorMessage] = createConfig();
    if (!config) {
      showToast({
        title: "Invalid configuration",
        message: errorMessage,
        type: "critical",
        role: "alert",
        lifespan: 1500,
      });
      return;
    }

    onSubmit(config);
  };

  return (
    <Modal
      title='Simulator settings'
      show={modalOpen}
      onDismiss={() => setModalOpen(false)}
      size='small'
    >
      <form onSubmit={handleSubmit(handleSubmitClick)} onReset={() => clearForm()} noValidate>
        <Flex flexDirection='column' gap={32}>
          <FieldSet legend='Simulation behavior' name='simulation-details'>
            <Switch value={sendMetrics} onChange={setSendMetrics}>
              Send metrics to Dynatrace
            </Switch>
          </FieldSet>
          <FieldSet legend='Execution details' name='execution-details'>
            <Flex gap={32}>
              <FormField required>
                <Label>Location</Label>
                <RadioGroup
                  value={location}
                  onChange={value => {
                    setLocation(value as SimulationLocation);
                    setValue("location", value as SimulationLocation, { shouldValidate: false });
                  }}
                >
                  <Radio
                    value='LOCAL'
                    disabled={
                      !(
                        specs.isPython ||
                        specs.localActiveGateDsExists ||
                        specs.localOneAgentDsExists
                      )
                    }
                  >
                    Local machine
                  </Radio>
                  <Radio value='REMOTE' disabled={specs.isPython}>
                    Remote target
                  </Radio>
                </RadioGroup>
              </FormField>
              <FormField required>
                <Label>EEC</Label>
                <RadioGroup
                  value={eecType}
                  onChange={value => {
                    setEecType(value as EecType);
                    setValue("eecType", value as EecType, { shouldValidate: false });
                  }}
                >
                  <Radio
                    value='ONEAGENT'
                    disabled={
                      (location === "LOCAL" && !specs.localOneAgentDsExists) ||
                      !specs.dsSupportsOneAgentEec
                    }
                  >
                    OneAgent
                  </Radio>
                  <Radio
                    value='ACTIVEGATE'
                    disabled={
                      (location === "LOCAL" && !specs.localActiveGateDsExists) ||
                      !specs.dsSupportsActiveGateEec
                    }
                  >
                    ActiveGate
                  </Radio>
                </RadioGroup>
              </FormField>
            </Flex>
          </FieldSet>
          {location === "REMOTE" && (
            <FieldSet legend='Remote target' name='remote-target'>
              <RemoteTargetsFieldSet
                targets={targets}
                eecType={eecType}
                selectedId={target}
                controlState={{
                  state: errors.target ? "error" : "valid",
                  hint: Array.isArray(errors.target)
                    ? errors.target.join("\n")
                    : errors.target?.message,
                }}
                register={register}
                onChange={value => {
                  setTarget(value);
                  setValue("target", value?.[0].toString() ?? "", { shouldValidate: true });
                }}
              />
            </FieldSet>
          )}
          {simulatorStatus === "NOTREADY" && (
            <Container variant='default' color='critical'>
              <Flex gap={12}>
                <WarningIcon />
                <Text>{simulatorStatusMessage}</Text>
              </Flex>
            </Container>
          )}
          <Flex paddingTop={16} gap={8} alignItems='center'>
            <Button type='submit' variant='accent' color='primary'>
              Save
            </Button>
          </Flex>
        </Flex>
      </form>
    </Modal>
  );
};
