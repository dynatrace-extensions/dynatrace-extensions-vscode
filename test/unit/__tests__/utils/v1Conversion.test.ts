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

import { readFileSync, readdirSync } from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";
import { convertPluginJsonToActivationSchema } from "../../../../src/commandPalette/python/pythonConversion";
import { ExtensionV1 } from "../../../../src/interfaces/extensionMeta";

const samplePluginJson: ExtensionV1 = {
  name: "custom.remote.python.rabbit_mq",
  version: "1.1.0",
  metricGroup: "tech.RabbitMQ",
  type: "python",
  properties: [
    { key: "rabbitmq_node", type: "textarea" },
    { key: "rabbitmq_username", type: "string", defaultValue: "guest" },
    { key: "rabbitmq_password", type: "password" },
    { key: "queues_include", type: "textarea", defaultValue: ".*" },
    { key: "frequency", type: "integer", defaultValue: 1 },
    { key: "log_level", type: "dropdown", dropdownValues: ["INFO", "DEBUG"], defaultValue: "INFO" },
  ],
  configUI: {
    displayName: "RabbitMQ",
    properties: [
      {
        key: "rabbitmq_node",
        displayName: "RabbitMQ Node",
        displayHint: "The rabbitmq management URL http://my.host:15672",
        displayOrder: 1,
      },
      { key: "rabbitmq_username", displayName: "RabbitMQ User", displayOrder: 2 },
      { key: "rabbitmq_password", displayName: "RabbitMQ Password", displayOrder: 3 },
      {
        key: "queues_include",
        displayName: "Queues to include",
        displayHint: "One regex expression per line, use .* to monitor all",
        displayOrder: 5,
      },
      { key: "frequency", displayName: "Frequency (minutes)", displayOrder: 7 },
      { key: "log_level", displayName: "Log level", displayOrder: 8 },
    ],
  },
  metrics: [],
  ui: {},
};

describe("V1 Plugin Conversion Utils - Python", () => {
  test("test plugin.json conversion", async () => {
    const converted = await convertPluginJsonToActivationSchema(samplePluginJson);
    const customExtensionType = converted.types.custom_extension;

    expect(customExtensionType.properties).toHaveProperty("rabbitmq_node");
    expect(customExtensionType.properties.rabbitmq_node.type).toBe("text");
    expect(customExtensionType.properties.rabbitmq_node.subType).toBe("multiline");
    expect(customExtensionType.properties.rabbitmq_node.description).toBe(
      "The rabbitmq management URL http://my.host:15672",
    );

    expect(customExtensionType.properties).toHaveProperty("rabbitmq_username");
    expect(customExtensionType.properties.rabbitmq_username.type).toBe("text");
    expect(customExtensionType.properties.rabbitmq_username.default).toBe("guest");

    expect(customExtensionType.properties).toHaveProperty("rabbitmq_password");
    expect(customExtensionType.properties.rabbitmq_password.type).toBe("secret");

    expect(customExtensionType.properties).toHaveProperty("queues_include");
    expect(customExtensionType.properties.queues_include.type).toBe("text");
    expect(customExtensionType.properties.queues_include.subType).toBe("multiline");

    expect(customExtensionType.properties).toHaveProperty("frequency");
    expect(customExtensionType.properties.frequency.type).toBe("integer");
    expect(customExtensionType.properties.frequency.default).toBe(1);

    expect(customExtensionType.properties).toHaveProperty("log_level");

    // Test enumns
    const enums = converted.enums;
    expect(enums).toBeDefined();
    expect(enums).toHaveProperty("log_level");
    expect(enums?.log_level.items).toHaveLength(2);

    // Test remote extension doesn't have pythonLocal
    expect(converted.types).not.toHaveProperty("pythonLocal");
    expect(converted.properties).not.toHaveProperty("pythonLocal");
  });
  test("test converting real plugin.json files", async () => {
    // Loop through files of testData/pluginJsonTestFiles
    const jsonDirPath = path.resolve(__dirname, "..", "..", "test_data", "plugin_json");
    const pluginJsonFiles = readdirSync(jsonDirPath);
    for (const pluginJsonFile of pluginJsonFiles) {
      const pluginJson = JSON.parse(
        readFileSync(path.resolve(jsonDirPath, pluginJsonFile), "utf8"),
      ) as ExtensionV1;
      const converted = await convertPluginJsonToActivationSchema(pluginJson);

      expect(converted).toBeDefined();
      expect(converted.types).toBeDefined();
      expect(converted.types.custom_extension).toBeDefined();
      expect(converted.types.custom_extension.properties).toBeDefined();
      expect(Object.keys(converted.types.custom_extension.properties)).not.toHaveLength(0);
    }
  });

  test("test converting plugin.json without properties", async () => {
    const pluginJson: ExtensionV1 = {
      name: "custom.remote.python.rabbit_mq",
      version: "1.1.0",
      metricGroup: "tech.RabbitMQ",
      type: "python",
      properties: [],
      configUI: {
        displayName: "RabbitMQ",
        properties: [],
      },
      metrics: [],
      ui: {},
    };
    // This should raise an exception
    await expect(convertPluginJsonToActivationSchema(pluginJson)).rejects.toThrowError();
  });

  test("test converting plugin.json without Config UI", async () => {
    const pluginJson: ExtensionV1 = {
      name: "custom.remote.python.rabbit_mq",
      version: "1.1.0",
      metricGroup: "tech.RabbitMQ",
      type: "python",
      properties: [
        { key: "rabbitmq_node", type: "textarea" },
        { key: "rabbitmq_username", type: "string", defaultValue: "guest" },
      ],
      metrics: [],
      ui: {},
    };

    const converted = await convertPluginJsonToActivationSchema(pluginJson);
    const customExtensionType = converted.types.custom_extension;

    expect(customExtensionType.properties).toHaveProperty("rabbitmq_node");
    expect(customExtensionType.properties.rabbitmq_node.type).toBe("text");
    expect(customExtensionType.properties.rabbitmq_node.subType).toBe("multiline");
    expect(customExtensionType.properties.rabbitmq_node.description).toBe("");
  });
});
