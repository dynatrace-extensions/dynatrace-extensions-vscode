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

/********************************************************************************
 * UTILITIES FOR PARSING RAW YAML CONTENT
 ********************************************************************************/

import vscode from "vscode";
import yaml from "yaml";

export function parseYAML<T>(data: string): T {
  return yaml.parse(data) as T;
}

/**
 * Gets the indent of a text line.
 * It's assumed that the space until the first character is the indent.
 * @param document {@link vscode.TextDocument}
 * @param lineNumber index of the line to check indent for
 * @returns indentation
 */
export function getIndent(document: vscode.TextDocument, lineNumber: number) {
  const lineCharMatch = /[a-z]/i.exec(document.lineAt(lineNumber).text);
  if (lineCharMatch) {
    return lineCharMatch.index;
  }

  return 0;
}

/**
 * Given a block label and a line within a yaml content, will calculate the item index
 * within that block that the line belongs to.
 * @param blockLabel label of the block to search within
 * @param blockLineIdx number of line belonging to the item inside the block
 * @param content the full yaml content to search within
 * @returns the index of the item, or -2 if not found or an error happened
 */
export function getBlockItemIndexAtLine(blockLabel: string, blockLineIdx: number, content: string) {
  let index = -2;
  let indent = -2;
  for (const [lineIndex, line] of content.split("\n").entries()) {
    // Exit once we're past the line in the original file
    if (lineIndex > blockLineIdx) {
      break;
    }
    // Block declaration found
    if (line.replace(/ /g, "").startsWith(`${blockLabel}:`)) {
      index = -1;
      continue;
    }
    // First line inside block is first list item
    if (index === -1) {
      indent = line.indexOf("-");
      index = 0;
      continue;
    }
    if (line.indexOf("-") === indent) {
      // new list item
      index++;
    }
  }
  return index;
}

/**
 * Given the label of a yaml list block, this function parses all entries of the list
 * and returns the start and end indexes relative to the original content string containing
 * the list. If the labelled block repeats within the content only the first entry is parsed.
 * @param listLabel label that identifies the list block
 * @param content string content where the block and its items can be found
 * @returns a map of each list item's index, start position, end position
 */
export function getListItemIndexes(listLabel: string, content: string) {
  const indexMap: { index: number; start: number; end: number }[] = [];
  let index = -2; // Keeps track of list item index
  let indent = -2; // The indent for this list of items
  let indexInDoc = 0; // The index of the current line relative to the original content

  for (const line of content.split("\n")) {
    // Exit if the line indent becomes less than what the list defined
    const lineStartIdx = /[a-z-]/i.exec(line);
    if (lineStartIdx && lineStartIdx.index < indent) {
      break;
    }
    indexInDoc += line.length + 1; // Newline char was removed during split
    // List declaration found
    if (line.replace(/ /g, "").startsWith(`${listLabel}:`)) {
      index++;
      continue;
    }
    // First line inside the block is the first item of the list
    if (index === -1) {
      indent = line.indexOf("-");
      index++;
      indexMap.push({ index: index, start: indexInDoc - line.length, end: indexInDoc });
      continue;
    }
    // Any other line starting with "-" at the same indentation is a new item
    if (line.indexOf("-") === indent) {
      index++;
      indexMap[index - 1].end = indexInDoc - line.length - 1;
      indexMap.push({ index: index, start: indexInDoc - line.length, end: indexInDoc });
    }
  }
  indexMap[index].end = indexInDoc;

  return indexMap;
}

/**
 * Given a line number and yaml content, returns a hierarchical list of parent block
 * labels. The last item in the list is the closest parent block label.
 * @param lineNumber number of the line to find
 * @param content yaml content in which to search
 * @returns list parent block labels
 */
export function getParentBlocks(lineNumber: number, content: string): string[] {
  const blocks: [string, number][] = [];
  const splitLines = content.split("\n");
  let pushNext: [string, number] = ["", -1];
  let popNext = 0;

  if (!(splitLines[lineNumber].startsWith(" ") || splitLines[lineNumber].startsWith("-"))) {
    return [splitLines[lineNumber].split(":")[0]];
  }

  for (const [i, line] of splitLines.entries()) {
    const line0Label = /[a-z]/i.exec(line);
    const line1Label = /[a-z]/i.exec(splitLines[i + 1]);

    if (i > lineNumber) {
      break;
    }

    if (line0Label) {
      if (pushNext[0] !== "" && pushNext[0] !== blocks[blocks.length - 1][0]) {
        blocks.push(pushNext);
        pushNext = ["", -1];
      }
      while (popNext > 0) {
        blocks.pop();
        popNext--;
      }
      if (line0Label.index === 0) {
        blocks.push([line.split(":")[0], 0]);
      } else {
        if (blocks.length > 0) {
          if (line0Label.index >= blocks[blocks.length - 1][1]) {
            if (line1Label && line1Label.index > line0Label.index) {
              pushNext = [line.substring(line0Label.index, line.indexOf(":")), line0Label.index];
            } else if (line1Label && line1Label.index < line0Label.index) {
              let lastBlockIdx = blocks[blocks.length - 1][1];
              while (line1Label.index <= lastBlockIdx) {
                popNext++;
                if (popNext === blocks.length) {
                  break;
                }
                lastBlockIdx = blocks[blocks.length - (popNext + 1)][1];
              }
            }
          }
        }
      }
    }
  }
  return blocks.map(block => block[0]);
}

export function isSameList(itemIdx: number, document: vscode.TextDocument) {
  const lineNumber = document.lineAt(document.positionAt(itemIdx)).lineNumber;
  const indent = getIndent(document, lineNumber);
  const prevIndent = getIndent(document, lineNumber - 1);
  return prevIndent === indent;
}

export function getNextElementIdx(
  lineNumber: number,
  document: vscode.TextDocument,
  startAt: number,
) {
  const content = document.getText();
  const prevIndent = getIndent(document, lineNumber);
  let indent;
  for (let li = lineNumber + 1; li <= document.lineCount - 1; li++) {
    const line = document.lineAt(li).text;
    const lineRe = new RegExp("[a-z]", "g").exec(line);
    indent = lineRe ? lineRe.index : 9999;
    if (indent < prevIndent) {
      return content.indexOf(document.lineAt(li).text, startAt);
    }
  }
  return content.length;
}

/**
 * Given a YAML block label, calculates the start and end indexes of the block (based on indent).
 * @param blockLabel yaml block label
 * @param document document to parse
 * @returns start and end index
 */
export function getBlockRange(
  blockLabel: string,
  document: vscode.TextDocument,
): { startIndex: number; endIndex: number } {
  let startIndex = -1;
  let endIndex = -1;
  let indent = -1;
  for (let li = 0; li < document.lineCount; li++) {
    const line = document.lineAt(li);

    // Skip over blank lines;
    if (line.text.replace(/\s/g, "") === "") {
      continue;
    }

    // Block declaration found
    if (line.text.replace(/ /g, "").startsWith(`${blockLabel}:`)) {
      indent = getIndent(document, li);
      startIndex = document.offsetAt(line.range.start);
      continue;
    }
    // We already found the start
    if (indent > -1) {
      const currentIndent = getIndent(document, li);
      // We found the end of the block
      if (
        currentIndent < indent ||
        (currentIndent === indent && !line.text.replace(/ /g, "").startsWith("-"))
      ) {
        endIndex = document.offsetAt(line.range.start);
      }
    }

    // Return the indexes when end is found
    if (endIndex > -1) {
      return { startIndex, endIndex };
    }
  }

  // At this point, end of block must be end of file
  return { startIndex, endIndex: document.getText().length - 1 };
}
