/**
  Copyright 2026 Dynatrace LLC

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
import { OpenPipelineFieldsToExtract } from "../interfaces/extensionDocs";
import { getDiagnostics } from "../utils/diagnostics";
import { createSingletonProvider } from "../utils/singleton";

const TAGS_FIELD: OpenPipelineFieldsToExtract = {
  referencedFieldName: "primary_tags.",
  strategy: "startsWith",
};

// Diagnostic message format: '... missing a Grail primary field extraction: "<field>"'
const extractGrailFieldFromMessage = (message: string): string | null => {
  const m = message.match(/:\s*"([^"]+)"/);
  return m ? m[1] : null;
};

// Find the next '[' at or after startOffset and return the range up to its matching ']'.
const findArrayRange = (
  text: string,
  startOffset: number,
): { start: number; end: number } | null => {
  let i = startOffset;
  while (i < text.length && text[i] !== "[") i++;
  if (i >= text.length) return null;
  const start = i;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  return null;
};

// Insert a missing field while keeping every startsWith-strategy entry at the end.
const insertField = (
  fields: OpenPipelineFieldsToExtract[],
  missing: OpenPipelineFieldsToExtract,
): OpenPipelineFieldsToExtract[] => {
  const result = [...fields];
  if (missing.strategy === "startsWith") {
    result.push(missing);
    return result;
  }
  let insertAt = result.length;
  while (insertAt > 0 && result[insertAt - 1].strategy === "startsWith") {
    insertAt--;
  }
  result.splice(insertAt, 0, missing);
  return result;
};

// Re-indent JSON.stringify output so that line 0 sits at the existing '[' position
// and every subsequent line is prefixed with the array's base indent.
const serializeFields = (fields: OpenPipelineFieldsToExtract[], baseIndent: string): string => {
  const raw = JSON.stringify(fields, null, 2);
  return raw
    .split("\n")
    .map((line, i) => (i === 0 ? line : baseIndent + line))
    .join("\n");
};

class OpenPipelineFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] {
    const diagnostics = getDiagnostics(document.uri).filter(
      d =>
        d.code === OPENPIPELINE_MISSING_TAGS_FIELD.code ||
        d.code === OPENPIPELINE_MISSING_GRAIL_FIELD.code,
    );
    if (diagnostics.length === 0) return [];

    // Group diagnostics by line (each group targets one processor's fieldsToExtract).
    const byLine = new Map<number, vscode.Diagnostic[]>();
    for (const d of diagnostics) {
      const line = d.range.start.line;
      const existing = byLine.get(line);
      if (existing) existing.push(d);
      else byLine.set(line, [d]);
    }

    const fixActions: vscode.CodeAction[] = [];
    for (const [line, lineDiags] of byLine) {
      if (range.start.line !== line) continue;

      for (const d of lineDiags) {
        const fix = this.buildFix(document, d);
        if (fix) fixActions.push(fix);
      }

      if (lineDiags.length > 1) {
        const combined = this.buildCombinedFix(document, lineDiags);
        if (combined) fixActions.push(combined);
      }
    }

    return fixActions;
  }

  private buildFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): vscode.CodeAction | null {
    const missing = this.missingFieldFor(diagnostic);
    if (!missing) return null;
    const edit = this.makeEdit(document, diagnostic.range.start.line, [missing]);
    if (!edit) return null;

    const title =
      diagnostic.code === OPENPIPELINE_MISSING_TAGS_FIELD.code
        ? 'Add "primary_tags." field extraction'
        : `Add "${missing.referencedFieldName}" field extraction`;
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.edit = edit;
    return action;
  }

  private buildCombinedFix(
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[],
  ): vscode.CodeAction | null {
    const missing = diagnostics
      .map(d => this.missingFieldFor(d))
      .filter((f): f is OpenPipelineFieldsToExtract => f !== null);
    if (missing.length === 0) return null;

    const edit = this.makeEdit(document, diagnostics[0].range.start.line, missing);
    if (!edit) return null;

    const action = new vscode.CodeAction(
      "Add all missing primary field extractions",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = diagnostics;
    action.edit = edit;
    return action;
  }

  private missingFieldFor(diagnostic: vscode.Diagnostic): OpenPipelineFieldsToExtract | null {
    if (diagnostic.code === OPENPIPELINE_MISSING_TAGS_FIELD.code) {
      return TAGS_FIELD;
    }
    if (diagnostic.code === OPENPIPELINE_MISSING_GRAIL_FIELD.code) {
      const message = typeof diagnostic.message === "string" ? diagnostic.message : "";
      const fieldName = extractGrailFieldFromMessage(message);
      if (!fieldName) return null;
      return { fieldName, referencedFieldName: fieldName };
    }
    return null;
  }

  private makeEdit(
    document: vscode.TextDocument,
    fieldsLine: number,
    missing: OpenPipelineFieldsToExtract[],
  ): vscode.WorkspaceEdit | null {
    const text = document.getText();
    const lineStartOffset = document.offsetAt(new vscode.Position(fieldsLine, 0));
    const arrayRange = findArrayRange(text, lineStartOffset);
    if (!arrayRange) return null;

    const arrayText = text.slice(arrayRange.start, arrayRange.end);
    let fields: OpenPipelineFieldsToExtract[];
    try {
      fields = JSON.parse(arrayText) as OpenPipelineFieldsToExtract[];
    } catch {
      return null;
    }

    let next = fields;
    for (const m of missing) next = insertField(next, m);

    const lineText = document.lineAt(fieldsLine).text;
    const baseIndent = /^\s*/.exec(lineText)?.[0] ?? "";
    const serialized = serializeFields(next, baseIndent);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(arrayRange.start), document.positionAt(arrayRange.end)),
      serialized,
    );
    return edit;
  }
}

export const getOpenPipelineFixProvider = createSingletonProvider(OpenPipelineFixProvider);
