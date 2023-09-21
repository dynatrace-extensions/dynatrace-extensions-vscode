import {
  Button,
  FieldSet,
  Flex,
  FormField,
  Radio,
  RadioGroup,
  TextInput,
} from "@dynatrace/strato-components-preview";
import { AcceptIcon } from "@dynatrace/strato-icons";
import React, { useState } from "react";
import { EecType, OsType, RemoteTarget, SimulatorPanelData } from "src/app/interfaces/simulator";

interface TargetRegistrationFormProps {
  setModalViewState: (newState: boolean) => void;
  setPanelData: (
    newData: SimulatorPanelData | ((prevValue: SimulatorPanelData) => SimulatorPanelData),
  ) => void;
}

export const TargetRegistrationForm = ({
  setModalViewState,
  setPanelData,
}: TargetRegistrationFormProps) => {
  const [targetName, setTargetName] = useState("");
  const [address, setAddress] = useState("");
  const [username, setUsername] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [eecType, setEECType] = useState<EecType>("ACTIVEGATE");
  const [osType, setOSType] = useState<OsType>("LINUX");

  const onFormSubmit = () => {
    console.log("Submit");
    setModalViewState(false);

    const remoteTarget: RemoteTarget = {
      name: targetName,
      address,
      username,
      privateKey,
      eecType: eecType,
      osType: osType,
    };
    setPanelData(prevValue => ({
      dataType: prevValue.dataType,
      data: {
        targets: [...prevValue.data.targets, remoteTarget],
        summaries: prevValue.data.summaries,
        status: prevValue.data.status,
      },
    }));

    return remoteTarget;
  };

  return (
    <Flex flexDirection='column'>
      <FormField label='Name' required={true}>
        <TextInput
          placeholder='Add target name'
          required={true}
          value={targetName}
          onChange={setTargetName}
        />
      </FormField>
      <FieldSet legend='Target info'>
        <FormField label='Address' required={true}>
          <TextInput placeholder='192.168.0.1' value={address} onChange={setAddress} />
        </FormField>
        <FormField label='Username' required={true}>
          <TextInput placeholder='Admin' value={username} onChange={setUsername} />
        </FormField>
        <FormField label='Private Key' required={true}>
          <TextInput
            placeholder='/path/to/private/key'
            value={privateKey}
            onChange={setPrivateKey}
          />
        </FormField>
      </FieldSet>
      <FieldSet legend='Target type'>
        <Flex flexDirection='row'>
          <FormField label='EEC'>
            <RadioGroup value={eecType} onChange={val => setEECType(val as EecType)}>
              <Radio aria-label='ONEAGENT' value={"ONEAGENT"}>
                OneAgent
              </Radio>
              <Radio aria-label='ACTIVEGATE' value={"ACTIVEGATE"}>
                ActiveGate
              </Radio>
            </RadioGroup>
          </FormField>
          <Flex flexItem paddingLeft={24}>
            <FormField label='OS'>
              <RadioGroup value={osType} onChange={val => setOSType(val as OsType)}>
                <Radio aria-label='LINUX' value='LINUX'>
                  Linux
                </Radio>
                <Radio aria-label='WINDOWS' value='WINDOWS'>
                  Windows
                </Radio>
              </RadioGroup>
            </FormField>
          </Flex>
        </Flex>
      </FieldSet>
      <Button
        data-testid='open-modal-button'
        color='primary'
        variant='accent'
        onClick={() => onFormSubmit()}
      >
        <Button.Prefix>{<AcceptIcon />}</Button.Prefix>Submit
      </Button>
    </Flex>
  );
};
