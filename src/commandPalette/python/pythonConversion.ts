import {
  ActivationSchema,
  ActivationSchemaProperty,
  ActivationSchemaPropertyType,
  ExtensionV1,
  V1ConfigUIProperty,
  V1Property,
} from "../../interfaces/extensionMeta";

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
  for (const property of v1Extension.properties ?? []) {
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

  // If the extension is remote, delete pythonLocal objects
  // If the extension is local, delete pythonRemote objects
  const isRemote = v1Extension.name.toLowerCase().startsWith("custom.remote.");
  if (isRemote) {
    delete activationSchema.types.pythonLocal;
    delete activationSchema.properties.pythonLocal;
  } else {
    delete activationSchema.types.pythonRemote;
    delete activationSchema.properties.pythonRemote;
  }

  return activationSchema;
}
