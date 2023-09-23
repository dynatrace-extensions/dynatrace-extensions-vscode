import {
  Button,
  FieldSet,
  Flex,
  FormField,
  Modal,
  Radio,
  RadioGroup,
  TextInput,
  showToast,
} from "@dynatrace/strato-components-preview";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { EecType, OsType, RemoteTarget } from "src/app/interfaces/simulator";

interface TargetRegistrationFormProps {
  modalOpen: boolean;
  handleCloseModal: () => void;
  onSubmit: (target: RemoteTarget) => void;
}

type RemoteTargetForm = {
  name: string;
  address: string;
  osType: OsType;
  eecType: EecType;
  username: string;
  privateKey: string;
};

export const TargetRegistrationForm = ({
  handleCloseModal,
  modalOpen,
  onSubmit,
}: TargetRegistrationFormProps) => {
  const [targetName, setTargetName] = useState("");
  const [address, setAddress] = useState("");
  const [username, setUsername] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [eecType, setEecType] = useState<EecType>("ACTIVEGATE");
  const [osType, setOsType] = useState<OsType>("LINUX");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RemoteTargetForm>({ mode: "all" });

  const createTarget = (): [RemoteTarget | undefined, string] => {
    if ([address, username, privateKey].includes("")) {
      return [undefined, "Not all fields are filled in"];
    }

    // TODO: Check if reachable?

    return [
      {
        name: targetName === "" ? address : targetName,
        address,
        osType: osType,
        eecType: eecType,
        username,
        privateKey,
      },
      "",
    ];
  };

  const clearForm = () => {
    setTargetName("");
    setAddress("");
    setOsType("LINUX");
    setEecType("ACTIVEGATE");
    setUsername("");
    setPrivateKey("");
  };

  const handleSubmitClick = () => {
    const [target, errorMessage] = createTarget();
    if (!target) {
      showToast({
        title: "Invalid target",
        message: errorMessage,
        type: "critical",
        role: "alert",
        lifespan: 3000,
      });
      return;
    }

    onSubmit(target);
    clearForm();
    handleCloseModal();
  };

  return (
    <Modal
      title='Register a new simulator target'
      show={modalOpen}
      onDismiss={() => {
        clearForm();
        handleCloseModal();
      }}
      size='small'
    >
      <form onSubmit={handleSubmit(handleSubmitClick)} onReset={() => clearForm()} noValidate>
        <Flex flexDirection='column' gap={32}>
          <FieldSet legend='Target details' name='target-details'>
            <FormField label='Name'>
              <TextInput
                placeholder='Enter a unique name for this target'
                value={targetName}
                onChange={value => {
                  setTargetName(value);
                  setValue("name", value, { shouldValidate: false });
                }}
              />
            </FormField>
            <FormField label='Address' required>
              <TextInput
                placeholder='Enter an IP address or hostname'
                controlState={{
                  state: errors.address ? "error" : "valid",
                  hint: errors.address?.message ?? "Please enter a valid IP address or hostname",
                }}
                value={address}
                {...register("address", {
                  required: {
                    value: true,
                    message: "Please enter an address.",
                  },
                  pattern: {
                    value: /^(?:[a-z-.0-9A-Z]+|((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4})$/,
                    message: "Must be a valid IP address or hostname",
                  },
                })}
                onChange={value => {
                  setAddress(value);
                  setValue("address", value, { shouldValidate: true });
                }}
              />
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
              <FormField label='OS' required>
                <RadioGroup
                  value={osType}
                  onChange={value => {
                    setOsType(value as OsType);
                    setValue("osType", value as OsType, { shouldValidate: false });
                  }}
                >
                  <Radio value='LINUX'>Linux</Radio>
                  <Radio value='WINDOWS'>Windows</Radio>
                </RadioGroup>
              </FormField>
            </Flex>
          </FieldSet>
          <FieldSet legend='Authentication'>
            <FormField label='Username' required>
              <TextInput
                placeholder='Enter a username that can login'
                value={username}
                {...register("username", {
                  required: { value: true, message: "Must enter a username" },
                })}
                onChange={value => {
                  setUsername(value);
                  setValue("username", value, { shouldValidate: true });
                }}
              />
            </FormField>
            <FormField label='Private key' required>
              <TextInput
                placeholder='/path/to/private/key'
                controlState={{
                  state: errors.privateKey ? "error" : "valid",
                  hint: errors.privateKey?.message,
                }}
                value={privateKey}
                {...register("privateKey", {
                  required: { value: true, message: "Must enter a path" },
                })}
                onChange={value => {
                  setPrivateKey(value);
                  setValue("privateKey", value, { shouldValidate: true });
                }}
              />
            </FormField>
          </FieldSet>
          <Flex paddingTop={16}>
            <Button type='submit' variant='accent' color='primary'>
              Submit
            </Button>
          </Flex>
        </Flex>
      </form>
    </Modal>
  );
};