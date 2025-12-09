/**
  Copyright 2025 Dynatrace LLC

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

import fs from "fs";
import path from "path";
import yaml from "yaml";
import {
  convertTopologyToOpenPipeline,
  convertTopologyTypes,
  InputCallback,
  OpenPipelineFieldsToExtract,
  OpenPipelineIdComponent,
  type OpenPipelineProcessor,
} from "../../../../src/commandPalette/convertTopology";
import { autoInputCallback } from "../../../../src/commandPalette/convertTopologyCallbacks";
import { ExtensionStub } from "../../../../src/interfaces/extensionMeta";

jest.mock("../../../../src/utils/logging");

describe("convertTopology", () => {
  const testDataPath = path.join(
    __dirname,
    "../../test_data/manifests/mulesoft_cloudhub_extension.yaml",
  );
  let extension: ExtensionStub;

  beforeAll(() => {
    const yamlContent = fs.readFileSync(testDataPath, "utf-8");
    extension = yaml.parse(yamlContent) as ExtensionStub;
  });

  describe("convertTopologyToOpenPipeline", () => {
    it("should convert topology to OpenPipeline format using auto callback", async () => {
      const pipeline = await convertTopologyToOpenPipeline(extension, autoInputCallback);

      expect(pipeline).toBeDefined();
      expect(pipeline.customId).toBe(extension.name);
      expect(pipeline.displayName).toBe("extension: mulesoft-cloudhub");
      expect(pipeline.smartscapeNodeExtraction).toBeDefined();
      expect(pipeline.smartscapeNodeExtraction.processors).toBeInstanceOf(Array);
      expect(pipeline.smartscapeNodeExtraction.processors.length).toBeGreaterThan(0);
    });

    it("should create processors for all topology types", async () => {
      const pipeline = await convertTopologyToOpenPipeline(extension, autoInputCallback);
      const processors = pipeline.smartscapeNodeExtraction.processors;

      // Should have processors for each type (org, env, app, api, vpn)
      // Each type should have at least one entity and one node processor
      expect(processors.length).toBeGreaterThan(5);

      // Check that we have both entity and node processors
      const entityProcessors = processors.filter(
        (p: OpenPipelineProcessor) => !p.smartscapeNode.extractNode,
      );
      const nodeProcessors = processors.filter(
        (p: OpenPipelineProcessor) => p.smartscapeNode.extractNode,
      );

      expect(entityProcessors.length).toBeGreaterThan(0);
      expect(nodeProcessors.length).toBeGreaterThan(0);
    });

    it("should use suggested type names", async () => {
      const pipeline = await convertTopologyToOpenPipeline(extension, autoInputCallback);
      const processors = pipeline.smartscapeNodeExtraction.processors;

      // Check that type names are uppercase with underscores
      const nodeTypes = processors.map((p: OpenPipelineProcessor) => p.smartscapeNode.nodeType);
      const uniqueNodeTypes = [...new Set(nodeTypes)];

      expect(uniqueNodeTypes).toContain("CLOUDHUB_ORG");
      expect(uniqueNodeTypes).toContain("CLOUDHUB_ENV");
      expect(uniqueNodeTypes).toContain("CLOUDHUB_APP");
    });

    it("should handle custom input callback", async () => {
      const mockCallback: InputCallback = jest.fn(async (_prompt, suggestedValue) => {
        // Return custom value instead of suggested
        return `CUSTOM_${suggestedValue}`;
      });

      const pipeline = await convertTopologyToOpenPipeline(extension, mockCallback);
      const processors = pipeline.smartscapeNodeExtraction.processors;

      // Check that custom names were used
      const nodeTypes = processors.map((p: OpenPipelineProcessor) => p.smartscapeNode.nodeType);
      const hasCustomPrefix = nodeTypes.some((type: string) => type.startsWith("CUSTOM_"));

      expect(hasCustomPrefix).toBe(true);
      expect(mockCallback).toHaveBeenCalled();
    });

    it("should throw error when user cancels", async () => {
      const cancelCallback: InputCallback = jest.fn(async () => null);

      await expect(convertTopologyToOpenPipeline(extension, cancelCallback)).rejects.toThrow(
        "User cancelled the operation",
      );
    });

    it("should throw error when extension has no topology section", async () => {
      const extensionWithoutTopology = { ...extension, topology: undefined };

      await expect(
        convertTopologyToOpenPipeline(extensionWithoutTopology, autoInputCallback),
      ).rejects.toThrow("Extension does not have a topology section.");
    });
  });

  describe("convertTopologyTypes", () => {
    it("should convert all topology types", async () => {
      if (!extension.topology?.types) {
        throw new Error("Extension topology types not found");
      }

      const processors = await convertTopologyTypes(
        extension.topology.types,
        extension.metrics,
        autoInputCallback,
      );

      expect(processors).toBeInstanceOf(Array);
      expect(processors.length).toBeGreaterThan(0);
    });

    it("should create processors with correct structure", async () => {
      if (!extension.topology?.types) {
        throw new Error("Extension topology types not found");
      }

      const processors = await convertTopologyTypes(
        extension.topology.types,
        extension.metrics,
        autoInputCallback,
      );

      processors.forEach(processor => {
        expect(processor).toHaveProperty("id");
        expect(processor).toHaveProperty("type", "smartscapeNode");
        expect(processor).toHaveProperty("matcher");
        expect(processor).toHaveProperty("description");
        expect(processor).toHaveProperty("smartscapeNode");

        const smartscapeNode = processor.smartscapeNode;
        expect(smartscapeNode).toHaveProperty("nodeType");
        expect(smartscapeNode).toHaveProperty("nodeIdFieldName", "node_id");
        expect(smartscapeNode).toHaveProperty("idComponents");
        expect(smartscapeNode).toHaveProperty("extractNode");
        expect(smartscapeNode).toHaveProperty("nodeName");

        // Verify idComponents is an array with at least one element
        expect(smartscapeNode.idComponents).toBeInstanceOf(Array);
        expect(smartscapeNode.idComponents.length).toBeGreaterThan(0);

        // Verify each idComponent has required fields
        smartscapeNode.idComponents.forEach((component: OpenPipelineIdComponent) => {
          expect(component).toHaveProperty("idComponent");
          expect(component).toHaveProperty("referencedFieldName");
        });
      });
    });

    it("should filter out blocked fields", async () => {
      if (!extension.topology?.types) {
        throw new Error("Extension topology types not found");
      }

      const processors = await convertTopologyTypes(
        extension.topology.types,
        extension.metrics,
        autoInputCallback,
      );

      processors.forEach(processor => {
        const fieldsToExtract = processor.smartscapeNode.fieldsToExtract || [];
        const blockedFields = fieldsToExtract.filter(
          (field: OpenPipelineFieldsToExtract) => field.fieldName === "dt.security_context",
        );

        expect(blockedFields.length).toBe(0);
      });
    });

    it("should only create one node extraction processor per entity type", async () => {
      if (!extension.topology?.types) {
        throw new Error("Extension topology types not found");
      }

      const processors = await convertTopologyTypes(
        extension.topology.types,
        extension.metrics,
        autoInputCallback,
      );

      // Group processors by node type and extractNode flag
      const nodeExtractionByType = new Map<string, number>();

      processors.forEach(processor => {
        if (processor.smartscapeNode.extractNode) {
          const nodeType = processor.smartscapeNode.nodeType;
          nodeExtractionByType.set(nodeType, (nodeExtractionByType.get(nodeType) || 0) + 1);
        }
      });

      // Each entity type should have exactly one node extraction processor
      nodeExtractionByType.forEach((count, _nodeType) => {
        expect(count).toBe(1);
      });
    });

    it("should convert metric conditions to matchers", async () => {
      if (!extension.topology?.types) {
        throw new Error("Extension topology types not found");
      }

      const processors = await convertTopologyTypes(
        extension.topology.types,
        extension.metrics,
        autoInputCallback,
      );

      processors.forEach(processor => {
        expect(processor.matcher).toBeDefined();
        expect(typeof processor.matcher).toBe("string");

        // Matcher should use DQL syntax
        expect(
          processor.matcher.includes("matchesValue") ||
            processor.matcher.includes("==") ||
            processor.matcher.includes("isNotNull"),
        ).toBe(true);
      });
    });

    it("should extract node name from instanceNamePattern", async () => {
      if (!extension.topology?.types) {
        throw new Error("Extension topology types not found");
      }

      const processors = await convertTopologyTypes(
        extension.topology.types,
        extension.metrics,
        autoInputCallback,
      );

      processors.forEach(processor => {
        const nodeName = processor.smartscapeNode.nodeName;

        expect(nodeName).toBeDefined();

        if (!nodeName) {
          return;
        }

        expect(nodeName).toHaveProperty("type");

        if (nodeName.type === "field") {
          expect(nodeName).toHaveProperty("field");
          expect(nodeName.field).toHaveProperty("sourceFieldName");
          expect(nodeName.field).toHaveProperty("defaultValue");
        } else if (nodeName.type === "constant") {
          expect(nodeName).toHaveProperty("constant");
        }
      });
    });
  });
});
