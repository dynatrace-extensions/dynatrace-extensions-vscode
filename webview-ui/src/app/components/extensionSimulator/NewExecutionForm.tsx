import {
  Modal,
  showToast,
  Flex,
  FieldSet,
  FormField,
  RadioGroup,
  Radio,
  Container,
  Text,
  Select,
  SelectOption,
  SelectedKeys,
  Switch,
  Button,
  ProgressCircle,
} from "@dynatrace/strato-components-preview";
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
} from "src/app/interfaces/simulator";

interface RemoteTargetsFieldSetProps {
  targets: RemoteTarget[];
  eecType: EecType;
  selectedId: SelectedKeys | null;
  register: UseFormRegister<ExecutionForm>;
  onChange: (value: SelectedKeys | null) => void;
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
    <FormField label='Select a target' required>
      <Select
        {...register("target", { required: { value: true, message: "Please select a target" } })}
        name='target'
        selectedId={selectedId}
        onChange={onChange}
        controlState={controlState}
      >
        {filteredTargets.map(t => (
          <SelectOption key={t.name} id={t.name}>
            {`${t.name} (${t.username}@${t.address})`}
          </SelectOption>
        ))}
      </Select>
    </FormField>
  );
};

type ExecutionForm = {
  location: SimulationLocation;
  eecType: EecType;
  target?: string;
  sendMetrics: boolean;
};

interface NewExecutionFormProps {
  modalOpen: boolean;
  setModalOpen: (state: boolean) => void;
  onSubmit: (config: SimulationConfig) => void;
  targets: RemoteTarget[];
  currentConfig?: SimulationConfig;
  simulatorStatus: SimulatorStatus;
  simulatorStatusMessage: string;
  specs: SimulationSpecs;
}

export const NewExecutionForm = ({
  modalOpen,
  setModalOpen,
  onSubmit,
  targets,
  specs,
  currentConfig,
  simulatorStatus,
  simulatorStatusMessage,
}: NewExecutionFormProps) => {
  const [location, setLocation] = useState<SimulationLocation>(
    !specs.localActiveGateDsExists && !specs.localOneAgentDsExists ? "REMOTE" : "LOCAL",
  );
  const [eecType, setEecType] = useState<EecType>(
    specs.dsSupportsOneAgentEec ? "ONEAGENT" : "ACTIVEGATE",
  );
  const [target, setTarget] = useState<SelectedKeys | null>(null);
  const [sendMetrics, setSendMetrics] = useState(false);

  useEffect(() => {
    if (currentConfig) {
      setLocation(currentConfig.location);
      setEecType(currentConfig.eecType);
      setTarget(currentConfig.target ? [currentConfig.target.name] : null);
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
    if (location === "REMOTE" && target?.[0] === "") {
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
      title='Start a new simulation'
      show={modalOpen}
      onDismiss={() => {
        clearForm();
        setModalOpen(false);
      }}
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
              <FormField label='Location' required>
                <RadioGroup
                  value={location}
                  onChange={value => {
                    setLocation(value as SimulationLocation);
                    setValue("location", value as SimulationLocation, { shouldValidate: false });
                  }}
                >
                  <Radio
                    value='LOCAL'
                    disabled={!specs.localActiveGateDsExists && !specs.localOneAgentDsExists}
                  >
                    Local machine
                  </Radio>
                  <Radio value='REMOTE'>Remote target</Radio>
                </RadioGroup>
              </FormField>
              <FormField label='EEC' required>
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
              <Flex gap={12} alignItems='center'>
                <WarningIcon size='large' />
                <Text>{simulatorStatusMessage}</Text>
              </Flex>
            </Container>
          )}
          <Flex paddingTop={16} gap={8} alignItems='center'>
            <Button type='submit' variant='accent' color='primary'>
              Start simulation
            </Button>
            {simulatorStatus === "CHECKING" && <ProgressCircle size='small' />}
          </Flex>
        </Flex>
      </form>
    </Modal>
  );
};
