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
} from "@dynatrace/strato-components-preview";
import { WarningIcon } from "@dynatrace/strato-icons";
import React, { useState } from "react";
import { UseFormRegister, useForm } from "react-hook-form";
import {
  EecType,
  RemoteTarget,
  SimulationConfig,
  SimulationLocation,
} from "src/app/interfaces/simulator";

interface NewExecutionFormProps {
  modalOpen: boolean;
  handleCloseModal: () => void;
  onSubmit: (config: SimulationConfig) => void;
  targets: RemoteTarget[];
}

type ExecutionForm = {
  location: SimulationLocation;
  eecType: EecType;
  target?: string;
  sendMetrics: boolean;
};

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

export const NewExecutionForm = ({
  modalOpen,
  handleCloseModal,
  onSubmit,
  targets,
}: NewExecutionFormProps) => {
  const [location, setLocation] = useState<SimulationLocation>("LOCAL");
  const [eecType, setEecType] = useState<EecType>("ONEAGENT");
  const [target, setTarget] = useState<SelectedKeys | null>(null);
  const [sendMetrics, setSendMetrics] = useState(false);

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
        lifespan: 3000,
      });
      return;
    }

    onSubmit(config);
    clearForm();
    handleCloseModal();
  };

  return (
    <Modal
      title='Start a new simulation'
      show={modalOpen}
      onDismiss={() => {
        clearForm();
        handleCloseModal();
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
            <FormField label='Location' required>
              <RadioGroup
                value={location}
                onChange={value => {
                  setLocation(value as SimulationLocation);
                  setValue("location", value as SimulationLocation, { shouldValidate: false });
                }}
              >
                <Radio value='LOCAL'>Local machine</Radio>
                <Radio value='REMOTE'>Remote target</Radio>
              </RadioGroup>
            </FormField>
            <Flex gap={32}>
              <FormField label='EEC' required>
                <RadioGroup
                  value={eecType}
                  onChange={value => {
                    setEecType(value as EecType);
                    setValue("eecType", value as EecType, { shouldValidate: false });
                  }}
                >
                  <Radio value='ONEAGENT'>OneAgent</Radio>
                  <Radio value='ACTIVEGATE'>ActiveGate</Radio>
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
          <Flex paddingTop={16}>
            <Button type='submit' variant='accent' color='primary'>
              Start simulation
            </Button>
          </Flex>
        </Flex>
      </form>
    </Modal>
  );
};
