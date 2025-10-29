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
  FieldSet,
  FormField,
  Modal,
  Radio,
  RadioGroup,
  TextInput,
  showToast,
  Label,
} from "@dynatrace/strato-components-preview";
import { Button, Container, Flex, Text, ExternalLink } from "@dynatrace/strato-components";
import { WarningIcon } from "@dynatrace/strato-icons";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { EecType, OsType, RemoteTarget } from "@common";

interface TargetRegistrationFormProps {
  modalOpen: boolean;
  handleCloseModal: () => void;
  nameIsUnique: (name: string) => boolean;
  onSubmit: (target: RemoteTarget) => void;
  editingTarget?: RemoteTarget;
}

export const TargetRegistrationForm = ({
  handleCloseModal,
  modalOpen,
  onSubmit,
  nameIsUnique,
  editingTarget,
}: TargetRegistrationFormProps) => {
  const [targetName, setTargetName] = useState("");
  const [address, setAddress] = useState("");
  const [username, setUsername] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [eecType, setEecType] = useState<EecType>(EecType.ActiveGate);
  const [osType, setOsType] = useState<OsType>(OsType.Linux);

  useEffect(() => {
    if (editingTarget) {
      setTargetName(editingTarget.name);
      setAddress(editingTarget.address);
      setUsername(editingTarget.username);
      setPrivateKey(editingTarget.privateKey);
      setEecType(editingTarget.eecType);
      setOsType(editingTarget.osType);
    }
  }, [editingTarget]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RemoteTarget>({ mode: "all" });

  const createTarget = (): [RemoteTarget | undefined, string] => {
    const resolvedName = targetName || address;

    if ([address, username, privateKey].includes("")) {
      return [undefined, "Not all fields are filled in"];
    }

    if (!editingTarget && !nameIsUnique(resolvedName)) {
      return [
        undefined,
        `Target ${resolvedName} already exists. Edit the existing entry or choose a different name`,
      ];
    }

    // TODO: Check if reachable?

    return [
      {
        name: resolvedName,
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
    setOsType(OsType.Linux);
    setEecType(EecType.ActiveGate);
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
      <form onSubmit={handleSubmit(handleSubmitClick)} onReset={clearForm} noValidate>
        <Flex flexDirection='column' gap={32}>
          <FieldSet legend='Target details' name='target-details'>
            <FormField>
              <Label>Name</Label>
              <TextInput
                placeholder='Enter a unique name for this target'
                value={targetName}
                onChange={value => {
                  setTargetName(value);
                  setValue("name", value, { shouldValidate: false });
                }}
              />
            </FormField>
            <FormField required>
              <Label>Address</Label>
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
                    value:
                      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)+([A-Za-z]|[A-Za-z][A-Za-z0-9-]*[A-Za-z0-9])$/,
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
              <FormField required>
                <Label>EEC</Label>
                <RadioGroup
                  value={eecType}
                  onChange={value => {
                    setEecType(value as EecType);
                    setValue("eecType", value as EecType, { shouldValidate: false });
                  }}
                >
                  <Radio value={EecType.OneAgent}>OneAgent</Radio>
                  <Radio value={EecType.ActiveGate}>ActiveGate</Radio>
                </RadioGroup>
              </FormField>
              <FormField required>
                <Label>OS</Label>
                <RadioGroup
                  value={osType}
                  onChange={value => {
                    setOsType(value as OsType);
                    setValue("osType", value as OsType, { shouldValidate: false });
                  }}
                >
                  <Radio value={OsType.Linux}>Linux</Radio>
                  <Radio value={OsType.Windows}>Windows</Radio>
                </RadioGroup>
              </FormField>
            </Flex>
          </FieldSet>
          <FieldSet legend='Authentication'>
            <FormField required>
              <Label>Username</Label>
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
            <FormField required>
              <Label>Private key</Label>
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
          {osType === OsType.Windows && (
            <Container variant='default' color='warning'>
              <Flex gap={12} alignItems='center'>
                <WarningIcon size={40} />
                <Text>
                  Please ensure that your Windows host has an SSH server available and enabled as
                  this is not the case by default. This{" "}
                  <ExternalLink href='https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse?tabs=gui'>
                    Microsoft article
                  </ExternalLink>{" "}
                  might useful.
                </Text>
              </Flex>
            </Container>
          )}
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
