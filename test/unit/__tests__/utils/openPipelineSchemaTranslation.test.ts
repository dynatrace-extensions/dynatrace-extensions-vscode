import {
  translateRef,
  translateItemSchema,
  translatePrimitiveSchema,
  translatePropertySchema,
  translateEnum,
  translateType,
  translateSchema,
  computeRequiredProperties,
  buildConditionals,
} from "../../../../src/utils/openPipelineSchemaTranslation";

describe("translateRef", () => {
  it("converts #/types/ references to #/$defs/", () => {
    expect(translateRef("#/types/Processor")).toBe("#/$defs/Processor");
  });

  it("converts #/enums/ references to #/$defs/", () => {
    expect(translateRef("#/enums/ProcessorType")).toBe("#/$defs/ProcessorType");
  });
});

describe("translatePrimitiveSchema", () => {
  it("translates text to string", () => {
    expect(translatePrimitiveSchema("text", [])).toEqual({ type: "string" });
  });

  it("translates boolean to boolean", () => {
    expect(translatePrimitiveSchema("boolean", [])).toEqual({ type: "boolean" });
  });

  it("translates integer to integer", () => {
    expect(translatePrimitiveSchema("integer", [])).toEqual({ type: "integer" });
  });

  it("translates float to number", () => {
    expect(translatePrimitiveSchema("float", [])).toEqual({ type: "number" });
  });

  it("translates secret to string", () => {
    expect(translatePrimitiveSchema("secret", [])).toEqual({ type: "string" });
  });

  it("translates setting to string", () => {
    expect(translatePrimitiveSchema("setting", [])).toEqual({ type: "string" });
  });

  it("applies LENGTH constraint min and max", () => {
    const result = translatePrimitiveSchema("text", [
      { type: "LENGTH", minLength: 3, maxLength: 256 },
    ]);
    expect(result).toEqual({ type: "string", minLength: 3, maxLength: 256 });
  });

  it("applies NOT_BLANK as minLength 1", () => {
    const result = translatePrimitiveSchema("text", [{ type: "NOT_BLANK" }]);
    expect(result.minLength).toBe(1);
  });

  it("does not override a larger minLength set by LENGTH when NOT_BLANK is also present", () => {
    const result = translatePrimitiveSchema("text", [
      { type: "NOT_BLANK" },
      { type: "LENGTH", minLength: 4 },
    ]);
    expect(result.minLength).toBe(4);
  });

  it("applies NO_WHITESPACE as pattern", () => {
    const result = translatePrimitiveSchema("text", [{ type: "NO_WHITESPACE" }]);
    expect(result.pattern).toBe("^\\S*$");
  });

  it("applies PATTERN constraint", () => {
    const result = translatePrimitiveSchema("text", [{ type: "PATTERN", pattern: "^[a-z]+$" }]);
    expect(result.pattern).toBe("^[a-z]+$");
  });

  it("uses allOf when multiple PATTERN constraints exist", () => {
    const result = translatePrimitiveSchema("text", [
      { type: "PATTERN", pattern: "^[a-z][a-z0-9._]{0,31}$" },
      { type: "PATTERN", pattern: "^(?![Dd][Tt]\\.).*$" },
    ]);
    expect(result.pattern).toBeUndefined();
    expect(result.allOf).toEqual([
      { pattern: "^[a-z][a-z0-9._]{0,31}$" },
      { pattern: "^(?![Dd][Tt]\\.).*$" },
    ]);
  });

  it("uses allOf when NO_WHITESPACE and PATTERN are both present", () => {
    const result = translatePrimitiveSchema("text", [
      { type: "NO_WHITESPACE" },
      { type: "PATTERN", pattern: "^(?![Dd][Tt]\\.).*$" },
    ]);
    expect(result.pattern).toBeUndefined();
    expect(result.allOf).toEqual([{ pattern: "^\\S*$" }, { pattern: "^(?![Dd][Tt]\\.).*$" }]);
  });

  it("falls back to string for unknown types", () => {
    expect(translatePrimitiveSchema("unknown_type", [])).toEqual({ type: "string" });
  });
});

describe("translateItemSchema", () => {
  it("translates a primitive item", () => {
    expect(translateItemSchema({ type: "text" })).toEqual({ type: "string" });
  });

  it("translates a $ref item", () => {
    expect(translateItemSchema({ type: { $ref: "#/types/Processor" } })).toEqual({
      $ref: "#/$defs/Processor",
    });
  });
});

describe("translatePropertySchema", () => {
  it("translates a simple non-nullable text property", () => {
    const result = translatePropertySchema({
      type: "text",
      nullable: false,
      constraints: [{ type: "LENGTH", maxLength: 100 }],
    });
    expect(result).toEqual({ type: "string", maxLength: 100 });
  });

  it("wraps nullable properties with anyOf including null", () => {
    const result = translatePropertySchema({ type: "text", nullable: true, constraints: [] });
    expect(result).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  });

  it("translates list type to array with items", () => {
    const result = translatePropertySchema({
      type: "list",
      nullable: false,
      items: { type: "text" },
      minObjects: 1,
      maxObjects: 50,
    });
    expect(result).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 50,
    });
  });

  it("translates set type to array with uniqueItems", () => {
    const result = translatePropertySchema({
      type: "set",
      nullable: false,
      items: { type: "text" },
      minObjects: 0,
      maxObjects: 10,
    });
    expect(result).toEqual({
      type: "array",
      uniqueItems: true,
      items: { type: "string" },
      maxItems: 10,
    });
  });

  it("applies NOT_EMPTY constraint on lists as minItems: 1", () => {
    const result = translatePropertySchema({
      type: "list",
      nullable: false,
      constraints: [{ type: "NOT_EMPTY" }],
      items: { type: "text" },
    });
    expect(result).toMatchObject({ minItems: 1 });
  });

  it("translates a $ref property", () => {
    const result = translatePropertySchema({
      type: { $ref: "#/types/Stage" },
      nullable: false,
    });
    expect(result).toEqual({ $ref: "#/$defs/Stage" });
  });

  it("wraps a nullable $ref with anyOf", () => {
    const result = translatePropertySchema({
      type: { $ref: "#/types/Stage" },
      nullable: true,
    });
    expect(result).toEqual({ anyOf: [{ $ref: "#/$defs/Stage" }, { type: "null" }] });
  });

  it("omits maxItems when maxObjects is 1 (single-value property)", () => {
    const result = translatePropertySchema({
      type: "list",
      nullable: false,
      items: { type: "text" },
      maxObjects: 1,
    });
    expect(result).not.toHaveProperty("maxItems");
  });
});

describe("translateEnum", () => {
  it("produces a string enum with all values", () => {
    const result = translateEnum({
      type: "enum",
      displayName: "MyEnum",
      items: [{ value: "a" }, { value: "b" }, { value: "c" }],
    });
    expect(result).toEqual({ type: "string", enum: ["a", "b", "c"] });
  });
});

describe("translateType", () => {
  it("produces an object schema with translated properties and additionalProperties false", () => {
    const result = translateType({
      type: "object",
      properties: {
        name: { type: "text", nullable: false },
        enabled: { type: "boolean", nullable: false },
      },
    });
    expect(result.type).toBe("object");
    expect(result.additionalProperties).toBe(false);
    expect(result.properties?.name).toEqual({ type: "string" });
    expect(result.properties?.enabled).toEqual({ type: "boolean" });
  });

  it("includes required array for non-nullable properties without preconditions", () => {
    const result = translateType({
      type: "object",
      properties: {
        id: { type: "text", nullable: false },
        label: { type: "text", nullable: true },
        conditional: {
          type: "text",
          nullable: false,
          precondition: { type: "EQUALS", property: "id", expectedValue: "special" },
        },
      },
    });
    expect(result.required).toEqual(["id"]);
  });

  it("omits required array when no properties qualify", () => {
    const result = translateType({
      type: "object",
      properties: {
        optional: { type: "text", nullable: true },
      },
    });
    expect(result.required).toBeUndefined();
  });

  it("includes allOf with if/then for preconditioned properties", () => {
    const result = translateType({
      type: "object",
      properties: {
        kind: { type: "text", nullable: false },
        extra: {
          type: "text",
          nullable: false,
          precondition: { type: "EQUALS", property: "kind", expectedValue: "special" },
        },
      },
    });
    expect(result.allOf).toEqual([
      {
        if: {
          properties: { kind: { const: "special" } },
          required: ["kind"],
        },
        then: { required: ["extra"] },
      },
    ]);
  });
});

describe("translateSchema", () => {
  const rawSchema = {
    schemaId: "builtin:example",
    displayName: "Example Schema",
    description: "An example",
    enums: {
      Status: {
        type: "enum",
        displayName: "Status",
        items: [{ value: "active" }, { value: "inactive" }],
      },
    },
    types: {
      Config: {
        type: "object",
        properties: {
          enabled: { type: "boolean", nullable: false },
        },
      },
    },
    properties: {
      name: { type: "text", nullable: false, constraints: [{ type: "LENGTH", maxLength: 100 }] },
      status: { type: { $ref: "#/enums/Status" }, nullable: true },
      config: { type: { $ref: "#/types/Config" }, nullable: true },
    },
  };

  it("includes $schema, title, and description at the root", () => {
    const result = translateSchema(rawSchema);
    expect(result.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(result.title).toBe("Example Schema");
    expect(result.description).toBe("An example");
  });

  it("includes all root properties translated correctly", () => {
    const result = translateSchema(rawSchema);
    expect(result.properties?.name).toEqual({ type: "string", maxLength: 100 });
    expect(result.properties?.status).toEqual({
      anyOf: [{ $ref: "#/$defs/Status" }, { type: "null" }],
    });
  });

  it("sets additionalProperties to false on the root", () => {
    const result = translateSchema(rawSchema);
    expect(result.additionalProperties).toBe(false);
  });

  it("includes required array for non-nullable root properties without preconditions", () => {
    const result = translateSchema(rawSchema);
    expect(result.required).toEqual(["name"]);
  });

  it("populates $defs with translated enums and types", () => {
    const result = translateSchema(rawSchema);
    expect(result.$defs?.Status).toEqual({ type: "string", enum: ["active", "inactive"] });
    expect(result.$defs?.Config).toEqual({
      type: "object",
      properties: { enabled: { type: "boolean" } },
      additionalProperties: false,
      required: ["enabled"],
    });
  });

  it("emits allOf with if/then for root-level preconditions", () => {
    const schemaWithPreconditions = {
      schemaId: "builtin:cond",
      properties: {
        kind: { type: "text", nullable: false },
        extra: {
          type: "text",
          nullable: false,
          precondition: { type: "EQUALS", property: "kind", expectedValue: "special" },
        },
      },
    };
    const result = translateSchema(schemaWithPreconditions);
    expect(result.allOf).toEqual([
      {
        if: {
          properties: { kind: { const: "special" } },
          required: ["kind"],
        },
        then: { required: ["extra"] },
      },
    ]);
  });
});

describe("computeRequiredProperties", () => {
  it("returns non-nullable properties without preconditions", () => {
    const result = computeRequiredProperties({
      id: { type: "text", nullable: false },
      name: { type: "text", nullable: false },
      label: { type: "text", nullable: true },
    });
    expect(result).toEqual(["id", "name"]);
  });

  it("excludes properties with preconditions", () => {
    const result = computeRequiredProperties({
      id: { type: "text", nullable: false },
      conditional: {
        type: "text",
        nullable: false,
        precondition: { type: "EQUALS", property: "id", expectedValue: "x" },
      },
    });
    expect(result).toEqual(["id"]);
  });

  it("returns empty array when all properties are nullable", () => {
    const result = computeRequiredProperties({
      opt1: { type: "text", nullable: true },
      opt2: { type: "text", nullable: true },
    });
    expect(result).toEqual([]);
  });

  it("treats properties with undefined nullable as required", () => {
    const result = computeRequiredProperties({
      implicit: { type: "text" },
    });
    expect(result).toEqual(["implicit"]);
  });
});

describe("buildConditionals", () => {
  it("returns empty array when no preconditions exist", () => {
    const result = buildConditionals({
      id: { type: "text", nullable: false },
    });
    expect(result).toEqual([]);
  });

  it("builds if/then for EQUALS precondition", () => {
    const result = buildConditionals({
      dql: {
        type: { $ref: "#/types/DqlAttributes" },
        nullable: false,
        precondition: { type: "EQUALS", property: "type", expectedValue: "dql" },
      },
    });
    expect(result).toEqual([
      {
        if: {
          properties: { type: { const: "dql" } },
          required: ["type"],
        },
        then: { required: ["dql"] },
      },
    ]);
  });

  it("builds if/then for NOT(EQUALS) precondition", () => {
    const result = buildConditionals({
      matcher: {
        type: "text",
        nullable: false,
        precondition: {
          type: "NOT",
          precondition: { type: "EQUALS", property: "type", expectedValue: "technology" },
        },
      },
    });
    expect(result).toEqual([
      {
        if: {
          not: {
            properties: { type: { const: "technology" } },
            required: ["type"],
          },
        },
        then: { required: ["matcher"] },
      },
    ]);
  });

  it("groups properties sharing the same precondition", () => {
    const sharedPrecondition = {
      type: "EQUALS" as const,
      property: "extractNode",
      expectedValue: true,
    };
    const result = buildConditionals({
      nodeName: {
        type: "text",
        nullable: false,
        precondition: sharedPrecondition,
      },
      fieldsToExtract: {
        type: "list",
        nullable: false,
        precondition: sharedPrecondition,
      },
    });
    expect(result).toEqual([
      {
        if: {
          properties: { extractNode: { const: true } },
          required: ["extractNode"],
        },
        then: { required: ["nodeName", "fieldsToExtract"] },
      },
    ]);
  });

  it("creates separate blocks for different preconditions", () => {
    const result = buildConditionals({
      propA: {
        type: "text",
        nullable: false,
        precondition: { type: "EQUALS", property: "kind", expectedValue: "a" },
      },
      propB: {
        type: "text",
        nullable: false,
        precondition: { type: "EQUALS", property: "kind", expectedValue: "b" },
      },
    });
    expect(result).toHaveLength(2);
    expect(result[0].then?.required).toEqual(["propA"]);
    expect(result[1].then?.required).toEqual(["propB"]);
  });
});
