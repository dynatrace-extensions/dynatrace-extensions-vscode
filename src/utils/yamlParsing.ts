import * as vscode from "vscode";

/**
 * Given a block label and a line within a yaml content, will calculate the item index
 * within that block that the line belongs to.
 * @param blockLabel label of the block to search within
 * @param blockLineIdx number of line belonging to the item inside the block
 * @param content the full yaml content to search within
 * @returns the index of the item, or -2 if not found or an error happened
 */
export function getBlockItemIndexAtLine(blockLabel: string, blockLineIdx: number, content: string) {
  var index = -2;
  var indent = -2;
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
 * Given a line number and yaml content, returns a hierarchical list of parent block
 * labels. The last item in the list is the closest parent block label.
 * @param lineNumber number of the line to find
 * @param content yaml content in which to search
 * @returns list parent block labels
 */
export function getParentBlocks(lineNumber: number, content: string): string[] {
  var blocks: [string, number][] = [];
  var splitLines = content.split("\n");
  var pushNext: [string, number] = ["", -1];
  var popNext = 0;

  if (!(splitLines[lineNumber].startsWith(" ") || splitLines[lineNumber].startsWith("-"))) {
    return [splitLines[lineNumber].split(":")[0]];
  }

  for (const [i, line] of splitLines.entries()) {
    let line0Label = /[a-z]/i.exec(line);
    let line1Label = /[a-z]/i.exec(splitLines[i + 1]);

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
  return blocks.map((block) => block[0]);
}
