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

import vscode from "vscode";
import { OPENPIPELINE_MISSING_GRAIL_FIELD, OPENPIPELINE_MISSING_TAGS_FIELD } from "../constants";
import { OpenPipelinePipeline, OpenPipelineProcessor } from "../interfaces/extensionDocs";
import { ExtensionDiagnosticDto } from "./diagnostics";

// Fields that must be present in every node extraction processor's fieldsToExtract
// https://docs.dynatrace.com/docs/shortlink/semantic-dictionary-primary-grail-fields
const GRAIL_PRIMARY_FIELDS = [
  "aws.account.id",
  "aws.region",
  "azure.location",
  "azure.resource.group",
  "azure.subscription",
  "dt.host_group.id",
  "gcp.project.id",
  "gcp.region",
  "k8s.cluster.name",
  "k8s.namespace.name",
];

/**
 * Finds the line number in the document where a processor's id field appears.
 * Falls back to 0 if not found.
 */
const findProcessorLine = (lines: string[], processorId: string): number => {
  const searchStr = `"id": "${processorId}"`;
  const idx = lines.findIndex(line => line.includes(searchStr));
  return idx >= 0 ? idx : 0;
};

/**
 * Finds the line number of the "fieldsToExtract" key within a processor's block.
 * Searches forward from the processor's id line, stopping when another processor's
 * id is encountered. Returns the processor line as a fallback.
 */
const findFieldsToExtractLine = (
  lines: string[],
  processorLine: number,
  nextProcessorLine: number,
): number => {
  for (let i = processorLine; i < nextProcessorLine; i++) {
    if (lines[i].includes('"fieldsToExtract"')) {
      return i;
    }
  }
  return processorLine;
};

/**
 * Creates a vscode.Diagnostic for an OpenPipeline issue.
 */
const createOpenPipelineDiagnostic = (
  lineNumber: number,
  document: vscode.TextDocument,
  dto: ExtensionDiagnosticDto,
  messageOverride?: string,
): vscode.Diagnostic => {
  const line = document.lineAt(lineNumber);
  const range = new vscode.Range(
    lineNumber,
    line.firstNonWhitespaceCharacterIndex,
    lineNumber,
    line.text.length,
  );
  return {
    range,
    message: messageOverride ?? dto.message,
    code: dto.code,
    severity: dto.severity,
    source: "Dynatrace Extensions",
  };
};

/**
 * Checks a single node extraction processor for missing tag and Grail primary field extractions.
 */
const diagnoseNodeProcessor = (
  processor: OpenPipelineProcessor,
  lines: string[],
  document: vscode.TextDocument,
  nextProcessorLine: number,
): vscode.Diagnostic[] => {
  const diagnostics: vscode.Diagnostic[] = [];
  const fieldsToExtract = processor.smartscapeNode?.fieldsToExtract ?? [];
  const processorLine = findProcessorLine(lines, processor.id);
  const fieldsLine = findFieldsToExtractLine(lines, processorLine, nextProcessorLine);

  // Check for primary_tags. STARTS_WITH entry
  const hasTagsField = fieldsToExtract.some(
    f => f.referencedFieldName === "primary_tags." && f.extractionStrategy === "STARTS_WITH",
  );
  if (!hasTagsField) {
    diagnostics.push(
      createOpenPipelineDiagnostic(fieldsLine, document, OPENPIPELINE_MISSING_TAGS_FIELD),
    );
  }

  // Check for each Grail primary field
  for (const field of GRAIL_PRIMARY_FIELDS) {
    const hasField = fieldsToExtract.some(f => f.referencedFieldName === field);
    if (!hasField) {
      diagnostics.push(
        createOpenPipelineDiagnostic(
          fieldsLine,
          document,
          OPENPIPELINE_MISSING_GRAIL_FIELD,
          `Node extraction processor is missing a Grail primary field extraction: "${field}"`,
        ),
      );
    }
  }

  return diagnostics;
};

/**
 * Provides diagnostics for an OpenPipeline pipeline JSON file.
 * Checks that every smartscapeNode processor with extractNode: true has:
 *   - A "primary_tags." STARTS_WITH field extraction (for tag propagation)
 *   - A field extraction for each of the 10 Grail primary fields
 */
export const diagnoseOpenPipeline = (document: vscode.TextDocument): vscode.Diagnostic[] => {
  let pipeline: OpenPipelinePipeline;
  try {
    pipeline = JSON.parse(document.getText()) as OpenPipelinePipeline;
  } catch {
    // Invalid JSON — let the built-in JSON language server report syntax errors
    return [];
  }

  const nodeProcessors = (pipeline.smartscapeNodeExtraction?.processors ?? []).filter(
    p => p.type === "smartscapeNode" && p.smartscapeNode?.extractNode === true,
  );

  if (nodeProcessors.length === 0) {
    return [];
  }

  const lines = document.getText().split("\n");

  // Pre-compute line numbers for all processors to bound the search range
  const processorLines = nodeProcessors.map(p => findProcessorLine(lines, p.id));

  const diagnostics: vscode.Diagnostic[] = [];
  for (let i = 0; i < nodeProcessors.length; i++) {
    const nextLine = i + 1 < processorLines.length ? processorLines[i + 1] : lines.length;
    diagnostics.push(...diagnoseNodeProcessor(nodeProcessors[i], lines, document, nextLine));
  }

  return diagnostics;
};
