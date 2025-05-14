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

import { Paragraph } from "@dynatrace/strato-components/typography";
import { EmptyState } from "@dynatrace/strato-components-preview/content";
import React from "react";

/**
 * A generic empty state similar to a 404 Not Found page.
 */
export const NotFound = () => {
  return (
    <EmptyState size='large'>
      <EmptyState.Visual>
        <EmptyState.VisualPreset type='something-wrong' context='generic' />
      </EmptyState.Visual>
      <EmptyState.Title>Oops...</EmptyState.Title>
      <EmptyState.Details>
        <Paragraph>This panel lost access to the data it needs to display.</Paragraph>
        <Paragraph>Please close it and then open it again through its designated action.</Paragraph>
      </EmptyState.Details>
    </EmptyState>
  );
};
