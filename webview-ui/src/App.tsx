import { Heading, Page, Text } from "@dynatrace/strato-components-preview";
import React from "react";

export const App = () => {
  return (
    <Page>
      <Page.Main>
        <Heading level={1}>Hello world</Heading>
        <Text>This is kind of a Dynatrace App lol.</Text>
      </Page.Main>
    </Page>
  );
};

export default App;
