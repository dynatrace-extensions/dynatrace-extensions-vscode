import { Heading, Flex, Text } from "@dynatrace/strato-components-preview";
import React from "react";

export const EmptyState = () => {
  return (
    <Flex flexDirection='column'>
      <Heading level={1}>Oops...</Heading>
      <Text>This panel lost access to the data it needs to display.</Text>
      <Text>Please close it and then open it again through its designated action.</Text>
    </Flex>
  );
};
