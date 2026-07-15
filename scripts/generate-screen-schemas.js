/**
 * Generates JSON Schema files for screen document types exported by @dynatrace/unified-analysis.
 *
 * Usage: node scripts/generate-screen-schemas.js
 *
 * Output: src/assets/jsonSchemas/screens/<name>.schema.json
 *
 * Re-run this script whenever the @dynatrace/unified-analysis package is updated
 * to keep the schemas in sync with the latest type definitions.
 */

const { createGenerator } = require("ts-json-schema-generator");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "src", "assets", "jsonSchemas", "screens");

const DOCUMENT_TYPES = [
  { typeName: "EntityDetailsDefinitionDocument", outputFile: "entityDetailsDefinition.schema.json" },
  { typeName: "EntityDetailsInjectionDocument", outputFile: "entityDetailsInjection.schema.json" },
  { typeName: "InvExDefinitionDocument", outputFile: "invExDefinition.schema.json" },
  { typeName: "InvExInjectionDocument", outputFile: "invExInjection.schema.json" },
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let hasErrors = false;

for (const { typeName, outputFile } of DOCUMENT_TYPES) {
  process.stdout.write(`Generating ${outputFile} from ${typeName}...`);
  try {
    const generator = createGenerator({
      path: path.join(__dirname, "screen-schema-types.ts"),
      tsconfig: path.join(__dirname, "..", "tsconfig.src.json"),
      type: typeName,
      skipTypeCheck: true,
      topRef: true,
      expose: "all",
      jsDoc: "extended",
    });
    const schema = generator.createSchema(typeName);
    const outputPath = path.join(OUTPUT_DIR, outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2) + "\n");
    const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);
    console.log(` OK (${sizeKB} KB)`);
  } catch (err) {
    console.error(` FAILED: ${err.message || err}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  process.exit(1);
}
