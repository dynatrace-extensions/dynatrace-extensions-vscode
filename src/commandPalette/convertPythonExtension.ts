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

import { writeFileSync } from "fs";
import * as vscode from "vscode";
import { Dynatrace } from "../dynatrace-api/dynatrace";
import {
  ActivationSchema,
  ActivationSchemaProperty,
  ActivationSchemaPropertyType,
  ExtensionV1,
  V1ConfigUIProperty,
  V1Property,
} from "../interfaces/extensionMeta";
import { showMessage } from "../utils/code";
import { CachedData } from "../utils/dataCaching";
import { extractV1FromRemote, extractv1ExtensionFromLocal } from "./convertJMXExtension";

// TODO - This is duplicated from the JMX Conversion, we should move it to a shared location
const OPTION_LOCAL_FILE: vscode.QuickPickItem = {
  label: "Locally",
  description: "Browse the local filesystem for a .json or .zip file",
};
const OPTION_DYNATRACE_ENVIRONMENT: vscode.QuickPickItem = {
  label: "Remotely",
  description: "Browse your Dynatrace environment for a Python extension",
};

const activationSchemaTemplate: ActivationSchema = {
  types: {
    custom_extension: {
      type: "object",
      displayName: "Custom Extension",
      properties: {},
    },
    pythonRemote: {
      type: "object",
      displayName: "Python Remote Extension",
      properties: {
        endpoints: {
          displayName: "Endpoint",
          type: "list",
          items: {
            type: {
              $ref: "#/types/custom_extension",
            },
          },
          nullable: false,
          minItems: 1,
          maxItems: 100,
          metaData: {
            addItemButton: "Add endpoint",
          },
        },
      },
    },
    pythonLocal: {
      type: "object",
      displayName: "Python Local Extension",
      properties: {
        endpoints: {
          displayName: "Endpoint",
          type: "list",
          items: {
            type: {
              $ref: "#/types/custom_extension",
            },
          },
          nullable: false,
          minItems: 1,
          maxItems: 1,
          metaData: {
            addItemButton: "Add endpoint",
          },
        },
      },
    },
  },
  properties: {
    pythonRemote: {
      displayName: "Python Remote Extension",
      type: {
        $ref: "#/types/pythonRemote",
      },
    },
    pythonLocal: {
      displayName: "Python Local Extension",
      type: {
        $ref: "#/types/pythonLocal",
      },
    },
  },

  // These are just to make the playground happy, they are not used when the extension is created
  dynatrace: "1",
  description: "extension configuration",
  schemaId: "python-extension.activation",
  displayName: "extension configuration",
  ownerProductManagement: "dynatrace",
  ownerDevelopment: "dynatrace",
  maturity: "GENERAL_AVAILABILITY",
  allowedScopes: ["tenant"],
  multiObject: false,
};

const v1TypetoV2TypeMap = {
  // Only use lower case here
  textarea: "text",
  string: "text",
  boolean: "boolean",
  integer: "integer",
  float: "float",
  password: "secret",
  json: "text",
  dropdown: {
    $ref: "#/enums/key",
  },
};

/**
 * Converts a single Extension V1 property to a v2 activation schema property
 * @param v1Property The v1 property (plugin.json)
 * @param v1ConfigUIProperty The optional v1 configUI property (plugin.json)
 * @returns The converted v2 activation schema property (activationSchema.json)
 */
function convertSingleProperty(
  v1Property: V1Property,
  v1ConfigUIProperty?: V1ConfigUIProperty,
): ActivationSchemaProperty {
  const lowerCaseType = v1Property.type.toLowerCase();

  let v2Type = v1TypetoV2TypeMap[lowerCaseType] as ActivationSchemaPropertyType;
  if (lowerCaseType === "dropdown") {
    v2Type = {
      $ref: `#/enums/${v1Property.key}`,
    };
  }

  const newProperty: ActivationSchemaProperty = {
    displayName: v1ConfigUIProperty?.displayName ?? v1Property.key,
    type: v2Type,
    description: v1ConfigUIProperty?.displayHint ?? "",
    nullable: true,
  };

  // Add the default value if it exists
  if (v1Property.defaultValue !== undefined) {
    newProperty.default = v1Property.defaultValue;
    newProperty.nullable = false;
  }

  return newProperty;
}

/**
 * Converts a extension v1 properties to a v2 activation schema
 * @param v1Extension The v1 extension (plugin.json)
 * @returns The converted v2 activation schema (activationSchema.json)
 */
export async function convertPluginJsonToActivationSchema(
  v1Extension: ExtensionV1,
): Promise<ActivationSchema> {
  // Copy the template
  const activationSchema = JSON.parse(JSON.stringify(activationSchemaTemplate)) as ActivationSchema;

  // loop through the properties of the v1Extension
  for (const property of v1Extension.properties) {
    const key = property.key;
    const lowerCaseType = property.type.toLowerCase();

    // Find the corresponding property in the configUI, if it exists
    const configUI = v1Extension.configUI ?? { properties: [] };
    const configUIProperty = configUI.properties.find(p => p.key === key);

    // Convert the property and add it to the activation schema
    const v2Property = convertSingleProperty(property, configUIProperty);
    activationSchema.types.custom_extension.properties[key] = v2Property;

    // If the property is a dropdown, we need to add the enum
    if (lowerCaseType === "dropdown") {
      if (activationSchema.enums === undefined) {
        activationSchema.enums = {};
      }

      const enumValues = property.dropdownValues ?? [];
      const items = enumValues.map(value => ({ value, displayName: value }));
      activationSchema.enums[key] = {
        displayName: key,
        type: "enum",
        items,
      };
    }

    // If the property is a textarea, we need to add the multiline subType
    if (lowerCaseType === "textarea") {
      v2Property.subType = "multiline";
    }
  }

  // Create summaryType with the first property
  // Test if the Record is empty first
  if (Object.keys(activationSchema.types.custom_extension.properties).length === 0) {
    throw new Error("The extension does not have any properties");
  }
  const firstProperty = v1Extension.properties[0].key;
  activationSchema.types.custom_extension.summaryPattern = `${v1Extension.name} - {${firstProperty}}`;

  return activationSchema;
}

/**
 * Parses a v1 plugin.json file and produces an equivalent 2.0 activationSchema.json.
 * The file can be loaded either locally or from a connected tenant and supports both direct
 * file parsing as well as zip browsing.
 * @param dataCache An instance of the data cache
 * @param dt Dynatrace Client API
 * @param outputPath optional path where to save the manifest
 */
export async function convertPythonExtension(
  dataCache: CachedData,
  dt?: Dynatrace,
  outputPath?: string,
) {
  // User chooses if they want to use a local file or browse from the Dynatrace environment
  const pluginJSONOrigins = [OPTION_LOCAL_FILE, OPTION_DYNATRACE_ENVIRONMENT];
  const pluginJSONOrigin = await vscode.window.showQuickPick(pluginJSONOrigins, {
    placeHolder: "How would you like to import the Python V1 extension?",
    title: "Convert Python plugin.json",
    canPickMany: false,
    ignoreFocusOut: true,
  });

  if (!pluginJSONOrigin) {
    showMessage("warn", "No selection made. Operation cancelled.");
    return;
  }

  const [v1Extension, errorMessage] =
    pluginJSONOrigin.label === OPTION_LOCAL_FILE.label
      ? await extractv1ExtensionFromLocal()
      : await extractV1FromRemote("Python", dt);

  if (errorMessage !== "") {
    showMessage("error", `Operation failed: ${errorMessage}`);
    return;
  }

  // Convert the v1 extension to v2
  try {
    const activationSchema = await convertPluginJsonToActivationSchema(v1Extension);

    // Ask the user where they would like to save the file to
    const options: vscode.SaveDialogOptions = {
      saveLabel: "Save",
      title: "Save Python extension activationSchema.json",
      filters: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Python v2 extension activation schema": ["json"],
      },
      defaultUri: vscode.Uri.file("activationSchema.json"),
    };

    const extensionJSONFile =
      outputPath ?? (await vscode.window.showSaveDialog(options).then(p => p?.fsPath));
    if (!extensionJSONFile) {
      showMessage("error", "No file was selected. Operation cancelled.");
      return;
    }
    // Save the file
    const jsonFileContents = JSON.stringify(activationSchema, null, 2);
    writeFileSync(extensionJSONFile, jsonFileContents);

    // Update the cache
    dataCache.updateParsedExtension();

    // Open the file
    const document = await vscode.workspace.openTextDocument(extensionJSONFile);
    await vscode.window.showTextDocument(document);
  } catch (e) {
    showMessage("error", `Operation failed: ${(e as Error).message}`);
    return;
  }
}
