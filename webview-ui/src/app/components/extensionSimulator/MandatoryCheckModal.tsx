import { Container, Flex, Modal, Text } from "@dynatrace/strato-components-preview";
import { CheckmarkIcon, WarningIcon } from "@dynatrace/strato-icons";
import React from "react";

const MANDATORY_CHECKS: { title: string; pass: string; fail: string }[] = [
  {
    title: "Manifest",
    pass: "Your workspace contains the extension manifest file.",
    fail: "Your workspace does not contain the extension manifest file.",
  },
  {
    title: "Datasource",
    pass: "The extension has a valid datasource",
    fail: "The extension's datasource is missing or not supported for the simulator",
  },
  {
    title: "Activation file",
    pass: "This workspace contains an simulator activation file.",
    fail: 'A "simulator.json" configuration file is missing from this workspace.',
  },
];

const filterChecks = (
  failedChecks: string[],
): { title: string; description: string; state: "pass" | "fail" }[] => {
  return MANDATORY_CHECKS.map(({ title, pass, fail }) => {
    if (failedChecks.includes(title)) {
      return {
        title,
        description: fail,
        state: "fail",
      };
    }
    return {
      title,
      description: pass,
      state: "pass",
    };
  });
};

interface MandatoryCheckModalProps {
  failedChecks: string[];
  modalOpen: boolean;
  setModalOpen: (state: boolean) => void;
}

export const MandatoryCheckModal = ({
  failedChecks,
  modalOpen,
  setModalOpen,
}: MandatoryCheckModalProps) => {
  return (
    <Modal
      title='Mandatory requirements for simulations'
      show={modalOpen}
      onDismiss={() => setModalOpen(false)}
      size='small'
    >
      <Flex flexDirection='column' gap={12}>
        {filterChecks(failedChecks).map(({ title, description, state }) => (
          <Container
            key={title}
            variant='default'
            color={state === "pass" ? "success" : "critical"}
          >
            <Flex gap={12}>
              {state === "pass" ? <CheckmarkIcon /> : <WarningIcon />}
              <Text>{description}</Text>
            </Flex>
          </Container>
        ))}
      </Flex>
    </Modal>
  );
};
