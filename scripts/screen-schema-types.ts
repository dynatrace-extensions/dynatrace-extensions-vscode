// Re-exports the document types for JSON Schema generation.
// Used by scripts/generate-screen-schemas.js — not imported by the extension at runtime.
import type {
  EntityDetailsDefinitionDocument,
  EntityDetailsInjectionDocument,
  InvExDefinitionDocument,
  InvExInjectionDocument,
} from "@dynatrace/unified-analysis/documents";

export type {
  EntityDetailsDefinitionDocument,
  EntityDetailsInjectionDocument,
  InvExDefinitionDocument,
  InvExInjectionDocument,
};
