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
 * UTILITIES FOR WORKING WITH SNMP
 ********************************************************************************/

import { readFileSync } from "fs";
import * as path from "path";
import axios from "axios";
import { showMessage } from "./code";

// URL to online OID Repository
const BASE_URL = "https://oid-rep.orange-labs.fr/get";

export interface OidInformation {
  description?: string;
  maxAccess?: string;
  status?: string;
  syntax?: string;
  objectType?: string;
  index?: string;
  oid?: string;
  source?: string;
}

/**
 * Checks whether an OID is readable from known access information.
 * @param info OID Info as prepared by {@link fetchOID}
 * @returns status
 */
export function isOidReadable(info: OidInformation): boolean {
  if (info.maxAccess) {
    return info.maxAccess !== "not-accessible";
  }

  // Assume true if no data availabe (error on our side)
  return true;
}

/**
 * Shallow check whether an OID defines a table.
 * @param info OID Info as prepared by {@link fetchOID}
 * @returns status
 */
export function isTable(info: OidInformation): boolean {
  return Boolean(info.syntax?.toLowerCase().includes("sequence"));
}

/**
 * Extract an OID from a metric value text (as present in yaml)
 * @param value
 * @returns oid
 */
export function oidFromMetriValue(value: string): string {
  return value.endsWith(".0") ? value.slice(4, value.length - 2) : value.slice(4);
}

/**
 * Given raw data from the online OID repository or a MIB file, parses this into a structured
 * object of OID metadata information.
 * @param details raw data
 * @returns OID metadata info
 */
function processOidData(details: string, oid?: string): OidInformation {
  const objectTypeMatches = /(.*?) OBJECT-TYPE/.exec(details) ?? [];
  const syntaxMatches = /SYNTAX (.*?) MAX-ACCESS/.exec(details) ?? [];
  const maxAccessMatches = /MAX-ACCESS (.*?) /.exec(details) ?? [];
  const statusMatches = /STATUS (.*?) /.exec(details) ?? [];
  const descriptionMatches = /DESCRIPTION "(.*?)"/.exec(details) ?? [];
  const indexMatches = /INDEX (.*?) ::=/.exec(details) ?? [];

  return {
    objectType: objectTypeMatches.length > 1 ? objectTypeMatches[1] : undefined,
    syntax: syntaxMatches.length > 1 ? syntaxMatches[1] : undefined,
    maxAccess: maxAccessMatches.length > 1 ? maxAccessMatches[1] : undefined,
    status: statusMatches.length > 1 ? statusMatches[1] : undefined,
    description: descriptionMatches.length > 1 ? descriptionMatches[1] : undefined,
    index: indexMatches.length > 1 ? indexMatches[1] : undefined,
    source: oid ? `https://oid-rep.orange-labs.fr/get/${oid}` : "Local MIB files",
  };
}

/**
 * Given an OID, pulls metadata information available online.
 * @param oid OID in standard dot notation
 * @returns metadata info or empty object if not available
 */
export async function fetchOID(oid: string) {
  console.log(`>>> Fetching OID ${oid}`);
  return axios
    .get(`${BASE_URL}/${oid}`)
    .then(res => {
      if (res.data) {
        const rawData = String(res.data)
          .slice(String(res.data).lastIndexOf("<code>") + 6)
          .split("</code>")[0]
          .replace(/\n/g, " ")
          .replace(/<br\/>/g, "");
        return processOidData(rawData, oid);
      }
      return {};
    })
    .catch(err => {
      console.log(err);
      return {};
    });
}

/**
 * Parses a MIB file to extract OID metadata.
 * All objects are referenced by name rather than ASN.1 notation.
 * @param filePath
 * @returns
 */
export function parseMibFile(filePath: string): OidInformation[] {
  const mibContent = readFileSync(filePath)
    .toString()
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/[\r\t\f\v]|\s{2,}/g, " ");

  const objectMatches = mibContent.match(/(\w+ OBJECT-TYPE .*?::= { .*? })/g);
  const parsedObjects = objectMatches.map(objectData => processOidData(objectData));

  return parsedObjects;
}

export interface MibObject {
  "ObjectName"?: string;
  "ModuleName"?: string;
  "NameSpace"?: string;
  "MACRO"?: string;
  "SYNTAX"?: string | Record<string, string>;
  "DESCRIPTION"?: string;
  "OBJECT IDENTIFIER"?: string;
  "OID"?: string;
  "STATUS"?: string;
  "INDEX"?: string;
  "ACCESS"?: string;
  "MAX-ACCESS"?: string;
  "AUGMENTS"?: string;
}

/**
 * Character Buffer and Parser
 */
class CharBuffer {
  logit = false;
  lastChar = "";
  state = "";
  open = false;
  CurrentSymbol = "";
  nested = 0;
  isComment = false;
  isEqual = false;
  isOID = false;
  isList = false;
  isString = false;
  inComment = false;
  inGroup = 0;
  builder = "";
  ColumnIndex = 0;
  RowIndex = 0;
  PreviousRow = 0;
  Table: Record<string, string[][]> = {};
  ModuleName: Record<string, unknown> = {};

  Append(char: string) {
    this.builder += char;
  }

  Fill(FileName: string, row: number) {
    if (this.builder.length == 0) {
      return;
    }
    const symbol = this.builder.toString().trim();
    this.builder = "";
    if (!Object.keys(this.Table).includes(FileName)) {
      this.Table[FileName] = [];
    } else if (this.PreviousRow < row) {
      this.RowIndex++;
      this.ColumnIndex = 0;
      this.PreviousRow = row;
    }
    const R = this.RowIndex;
    const C = this.ColumnIndex;

    if (!this.Table[FileName][R] || C === 0) {
      this.Table[FileName][R] = Object.defineProperty<string[]>([], "line", {
        enumerable: false,
        value: row + 1,
      });
    }
    this.isEqual = false;
    switch (symbol) {
      case ")":
        this.Table[FileName][R][C] = symbol;
        this.ColumnIndex++;
        this.logit = false;
        break;
      case "(":
        this.Table[FileName][R][C] = symbol;
        this.ColumnIndex++;
        this.logit = true;
        break;
      case "DEFINITIONS":
        if (C == 0) {
          this.ModuleName[FileName] = this.Table[FileName][R - 1][C];
        } else {
          this.ModuleName[FileName] = this.Table[FileName][R][C - 1];
        }
        this.Table[FileName][R][C] = symbol;
        this.ColumnIndex++;
        break;
      case "::=":
        this.Table[FileName][R][C] = symbol;
        this.ColumnIndex++;
        this.isEqual = true;
        break;
      case "{":
        if (this.Table[FileName][R][C - 1] != "::=") {
          this.isList = true;
        }
        this.Table[FileName][R][C] = symbol;
        this.ColumnIndex++;
        break;
      case "NOTATION":
        if (this.Table[FileName][R][C - 1] == "TYPE" || this.Table[FileName][R][C - 1] == "VALUE") {
          this.Table[FileName][R][C - 1] += " NOTATION";
        }
        break;

      case "OF":
        if (this.Table[FileName][R][C - 1] == "SEQUENCE") {
          this.Table[FileName][R][C - 1] = "SEQUENCE OF";
        }
        break;
      case "IDENTIFIER":
        if (this.Table[FileName][R][C - 1] == "OBJECT") {
          this.Table[FileName][R][C - 1] = "OBJECT IDENTIFIER";
        }
        break;
      case "STRING":
        if (this.Table[FileName][R][C - 1] == "OCTET") {
          this.Table[FileName][R][C - 1] = "OCTET STRING";
        }
        break;
      default:
        this.Table[FileName][R][C] = symbol;
        this.ColumnIndex++;
        break;
    }
  }
}

/**
 * MIB Parser
 */
class MibParser {
  directory: string;
  SymbolBuffer = {};
  StringBuffer = "";
  Modules: Record<string, Record<string, MibObject>> = {};
  Objects = {};
  MACROS = [];
  CurrentObject = null;
  TempObject = {};
  CurrentClause = "";
  WaitFor = "";
  CharBuffer = new CharBuffer();

  constructor(dir?: string) {
    this.directory = dir ?? "";
    this.initializeBuffer();
  }

  initializeBuffer() {
    this.CharBuffer.logit = false;
    this.CharBuffer.lastChar = "";
    this.CharBuffer.state = "";
    this.CharBuffer.open = false;
    this.CharBuffer.CurrentSymbol = "";
    this.CharBuffer.nested = 0;
    this.CharBuffer.isComment = false;
    this.CharBuffer.isEqual = false;
    this.CharBuffer.isOID = false;
    this.CharBuffer.isList = false;
    this.CharBuffer.isString = false;
    this.CharBuffer.inComment = false;
    this.CharBuffer.inGroup = 0;
    this.CharBuffer.builder = "";
    this.CharBuffer.ColumnIndex = 0;
    this.CharBuffer.RowIndex = 0;
    this.CharBuffer.PreviousRow = 0;
  }

  ParseModule(FileName: string, Contents: string) {
    this.initializeBuffer();

    Contents.split("\n").forEach((line, i) => {
      this.ParseLine(FileName, line, i);
    });
  }

  Import(FilePath: string) {
    this.ParseModule(path.basename(FilePath).split(".")[0], readFileSync(FilePath).toString());
  }

  ParseLine(FileName: string, line: string, row: number) {
    let len = line.length;
    if (line[len - 1] === "\r") --len;
    for (let i = 0; i < len; i++) {
      const char = line.charAt(i);
      this.ParseChar(FileName, char, row);
    }
    this.ParseChar(FileName, "\n", row);
  }

  ParseChar(FileName: string, char: string, row: number) {
    switch (char) {
      case "\r":
      case "\n":
        if (!this.CharBuffer.isString) {
          this.CharBuffer.Fill(FileName, row);
          this.CharBuffer.isComment = false;
          this.CharBuffer.inGroup = 0; //IGNORE GROUPINGS ACROSS COMMENTS
        } else if (this.CharBuffer.isComment) {
          this.CharBuffer.Append(char);
        }
        break;
      case "{":
        if (!this.CharBuffer.isComment && this.CharBuffer.isEqual) {
          this.CharBuffer.isOID = true;
        }
      /* eslint-disable-next-line no-fallthrough */
      case "[":
      case "(":
        if (!this.CharBuffer.isComment && !this.CharBuffer.isString) {
          this.CharBuffer.nested++;
          if (char == "(" || char == "{") {
            // Emit the previous token if this is the start of an outer group
            if (this.CharBuffer.nested === 1) {
              this.CharBuffer.Fill(FileName, row);
            }
            this.CharBuffer.inGroup++;
          }
        }
        if (
          this.CharBuffer.isComment ||
          ((this.CharBuffer.isOID || this.CharBuffer.nested > 0) &&
            (!this.CharBuffer.isList || this.CharBuffer.inGroup > 0))
        ) {
          this.CharBuffer.Append(char);
        } else {
          this.CharBuffer.Fill(FileName, row);
          this.CharBuffer.Append(char);
          this.CharBuffer.Fill(FileName, row);
        }
        break;
      case "}":
      case "]":
      case ")":
        if (!this.CharBuffer.isComment && !this.CharBuffer.isString) {
          this.CharBuffer.nested--;
          if (this.CharBuffer.nested < 0) {
            this.CharBuffer.nested = 0;
          }
          if (char == ")") {
            this.CharBuffer.inGroup--;
            if (this.CharBuffer.inGroup < 0) {
              this.CharBuffer.inGroup = 0; // ignore grouping across comments
            }
          }
        }
        if (
          this.CharBuffer.isComment ||
          ((this.CharBuffer.isOID || this.CharBuffer.nested >= 0) &&
            (!this.CharBuffer.isList || this.CharBuffer.inGroup >= 0))
        ) {
          this.CharBuffer.Append(char);
        } else {
          this.CharBuffer.Fill(FileName, row);
          this.CharBuffer.Append(char);
          this.CharBuffer.Fill(FileName, row);
        }
        if (char == "}") {
          this.CharBuffer.isOID = false;
          this.CharBuffer.isList = false;
        }
        break;
      case ",":
        if (this.CharBuffer.isComment) {
          this.CharBuffer.Append(char);
        } else {
          this.CharBuffer.Fill(FileName, row);
          this.CharBuffer.Append(char);
          this.CharBuffer.Fill(FileName, row);
        }
        break;
      case ";":
        if (this.CharBuffer.isComment) {
          this.CharBuffer.Append(char);
        } else {
          this.CharBuffer.Fill(FileName, row);
          this.CharBuffer.Append(char);
          this.CharBuffer.Fill(FileName, row);
        }
        break;
      case " ":
      case "\t":
        if (
          this.CharBuffer.isComment ||
          ((this.CharBuffer.isOID || this.CharBuffer.nested > 0) &&
            (!this.CharBuffer.isList || this.CharBuffer.inGroup > 0))
        ) {
          this.CharBuffer.Append(char);
        } else {
          this.CharBuffer.Fill(FileName, row);
        }
        break;
      case "-":
        this.CharBuffer.Append(char);
        if (!this.CharBuffer.isString && this.CharBuffer.lastChar == "-") {
          this.CharBuffer.isComment = true;
          this.CharBuffer.builder = this.CharBuffer.builder.split("--")[0];
          this.CharBuffer.Fill(FileName, row);
          this.CharBuffer.builder = "--";
        }

        break;
      case '"':
        if (this.CharBuffer.isComment && !this.CharBuffer.isString && !this.CharBuffer.inComment) {
          //011 = COMMENT
          //IF 011 SET 101
          this.CharBuffer.isComment = true;
          this.CharBuffer.isString = false;
          this.CharBuffer.inComment = true;
        } else if (
          !this.CharBuffer.isComment &&
          !this.CharBuffer.isString &&
          !this.CharBuffer.inComment
        ) {
          //000 = STRING
          //IF 000 SET 110
          this.CharBuffer.isComment = true;
          this.CharBuffer.isString = true;
          this.CharBuffer.inComment = false;
          this.CharBuffer.Fill(FileName, row); //new string
        } else if (
          this.CharBuffer.isComment &&
          this.CharBuffer.isString &&
          !this.CharBuffer.inComment
        ) {
          //110 = END STRING
          //IF 110 SET 000
          this.CharBuffer.isComment = false;
          this.CharBuffer.isString = false;
          this.CharBuffer.inComment = false;
        } else if (
          this.CharBuffer.isComment &&
          !this.CharBuffer.isString &&
          this.CharBuffer.inComment
        ) {
          //101 = END COMMENT
          //IF 101 SET 000
          this.CharBuffer.isComment = true;
          this.CharBuffer.isString = false;
          this.CharBuffer.inComment = false;
        }

        if (this.CharBuffer.isComment) {
          this.CharBuffer.Append(char);
        } else {
          this.CharBuffer.Append(char);
          this.CharBuffer.Fill(FileName, row);
        }
        break;
      default:
        this.CharBuffer.Append(char);
        break;
    }
    this.CharBuffer.lastChar = char;
  }

  Serialize() {
    const Table = this.CharBuffer.Table;
    let ModuleName = "";
    for (const FileName in Table) {
      ModuleName = this.CharBuffer.ModuleName[FileName] as string;
      this.SymbolBuffer[ModuleName] = [];
      let foundTheEnd = false;
      let lastGoodDeclaration = ["none"];
      const file = Table[FileName];
      for (const row of file) {
        for (const symbol of row) {
          let addSymbol = true;
          switch (symbol) {
            case "END":
              foundTheEnd = true;
              break;
            case "::=":
              foundTheEnd = false;
              lastGoodDeclaration = row;
              break;
            default:
              if (symbol.startsWith("--")) {
                //REMOVE COMMENTS
                //console.log(ModuleName, symbol);
                addSymbol = false;
              } else {
                foundTheEnd = false;
              }
          }
          if (addSymbol) {
            (this.SymbolBuffer[ModuleName] as string[]).push(symbol);
          }
        }
      }
      if (!foundTheEnd) {
        // Warn that the contents are malformed
        console.warn(
          '[%s]: Incorrect formatting: no END statement found - last good declaration "%s" (line ?)',
          ModuleName,
          lastGoodDeclaration.join(" "),
        );
      }
    }
    this.Compile();
  }

  Compile() {
    for (const ModuleName in this.SymbolBuffer) {
      if (Object.keys(this.SymbolBuffer).includes(ModuleName)) {
        if (!Object.keys(this.Modules).includes(ModuleName)) {
          this.Modules[ModuleName] = {};
        }
        const Module = this.Modules[ModuleName];
        const Symbols = this.SymbolBuffer[ModuleName] as string[];
        let snmpObject = Module;
        let MACROName = "";
        for (let i = 0; i < Symbols.length; i++) {
          switch (Symbols[i]) {
            case "::=": //new OBJECT to define
              //if OBJECT IDENTIFIER tag IS NEXT, FIND MARCO TO CALL...
              if (Symbols[i + 1].startsWith("{")) {
                let r = i - 1;
                let found = false;
                //Go back and find the MACRO to call
                while (!found && r > 0) {
                  r--;
                  for (const m of this.MACROS) {
                    if (Symbols[r] == m) {
                      found = true;
                      break;
                    }
                  }
                }
                if (Symbols[i - 1] == "OBJECT IDENTIFIER") {
                  snmpObject[Symbols[i - 2]] = {};
                  snmpObject[Symbols[i - 2]].ObjectName = Symbols[i - 2];
                  snmpObject[Symbols[i - 2]].ModuleName = ModuleName;
                  snmpObject[Symbols[i - 2]]["OBJECT IDENTIFIER"] = Symbols[i + 1]
                    .replace("{", "")
                    .replace("}", "")
                    .trim()
                    .replace(/\s+/, " ");
                  if (snmpObject[Symbols[i - 2]]["OBJECT IDENTIFIER"] == "0 0") {
                    snmpObject[Symbols[i - 2]].OID = "0.0";
                    snmpObject[Symbols[i - 2]].NameSpace = "null";
                  } else {
                    this.OID(
                      snmpObject[Symbols[i - 2]]["OBJECT IDENTIFIER"],
                      "",
                      Symbols[i - 2],
                      "",
                      /* eslint-disable-next-line @typescript-eslint/no-loop-func */
                      function (ID, OD) {
                        snmpObject[Symbols[i - 2]].OID = ID;
                        snmpObject[Symbols[i - 2]].NameSpace = OD;
                        //snmpObject[Symbols[i - 2]]['ModuleName'] = ModuleName;
                        // snmpObject[Symbols[i - 2]]['ObjectName'] = Symbols[i - 2];
                      },
                    );
                  }
                } else {
                  const ObjectName = Symbols[r - 1];
                  snmpObject[ObjectName] = {};
                  snmpObject[ObjectName].ObjectName = ObjectName;
                  snmpObject[ObjectName].ModuleName = ModuleName;
                  snmpObject[ObjectName].MACRO = Symbols[r];
                  //BUILD OBJECT FROM MACRO TYPE NOTATION
                  let MARCO = this[Symbols[r]] as unknown;
                  if (!MARCO) {
                    //HACK IF MARCO IS NOT FOUND
                    MARCO = {};
                    //return;
                  }
                  let c1 = r;
                  const keychain = [];
                  keychain.push("DESCRIPTION");
                  let key;
                  for (const notation in MARCO["TYPE NOTATION"]) {
                    key = notation;
                    //if TYPE NOTATION does not have a value
                    /* eslint-disable-next-line */
                    if (MARCO["TYPE NOTATION"][notation] == null) {
                      //then look up the value from the MACRO Root
                      /* eslint-disable-next-line */
                      key = MARCO[notation]["MACRO"].replace(/"/g, "");
                    }
                    keychain.push(key);
                  }
                  while (c1 < i - 1) {
                    c1++;
                    key = Symbols[c1]; //Parse TYPE NOTATION. ex: SYNTAX, ACCESS, STATUS, DESCRIPTION.....

                    //key == 'DESCRIPTION' ? console.log(keychain.indexOf(key), key, Symbols[c1 + 1]) : false;

                    const regExp = /\(([^)]+)\)/; //in parentheses ex: "ethernet-csmacd (6)"

                    if (keychain.includes(key) || key == "REVISION") {
                      let val: string | string[] | Record<string, unknown>;
                      val = Symbols[c1 + 1].replace(/"/g, "");
                      //if value array.
                      if (val.startsWith("{")) {
                        c1++;
                        while (!Symbols[c1].includes("}")) {
                          c1++;
                          val += Symbols[c1];
                        }
                        if (key == "DEFVAL") {
                          // DEFVAL { 1500 } is not an array
                          val = val.replace(/^{/, "").replace(/}$/, "").trim();
                        } else {
                          // build value array
                          val = val.replace("{", "").replace("}", "").split(",");
                        }
                      }

                      switch (key) {
                        case "SYNTAX":
                          switch (val) {
                            case "BITS":
                            case "INTEGER":
                            case "Integer32":
                              // integer value array e.g. INTEGER {...rfc877-x25 (5), ethernet-csmacd (6)...}
                              if (Symbols[c1 + 2].startsWith("{")) {
                                const valObj = val;
                                val = {};
                                val[valObj] = {};
                                c1 = c1 + 1;
                                let integer;
                                let syntax;
                                while (!Symbols[c1].includes("}")) {
                                  c1++;
                                  let ok = false;
                                  if (Symbols[c1].startsWith("(") && Symbols[c1].length > 1) {
                                    integer = regExp.exec(Symbols[c1]);
                                    syntax = Symbols[c1 - 1];
                                    ok = true;
                                  } else if (Symbols[c1].indexOf("(") > 0) {
                                    integer = regExp.exec(Symbols[c1]);
                                    syntax = Symbols[c1].split("(")[0];
                                    ok = true;
                                  }
                                  if (syntax?.startsWith("{")) {
                                    syntax = syntax.split("{")[1].trim();
                                  }
                                  if (ok) {
                                    val[valObj][integer[1]] = syntax;
                                  }
                                }
                                // integer range e.g. INTEGER (1..2147483647)
                              } else if (Symbols[c1 + 2].startsWith("(")) {
                                const valObj = val;
                                val = {};
                                val[valObj] = {
                                  ranges: this.GetRanges(Symbols[c1 + 2]),
                                };
                              }
                              break;
                            case "OCTET STRING":
                            case "DisplayString":
                              // string size e.g. OCTET STRING (SIZE (0..127))
                              if (Symbols[c1 + 2].replace(/ */g, "").startsWith("(SIZE")) {
                                const valObj = val;
                                val = {};
                                val[valObj] = {
                                  sizes: this.GetRanges(Symbols[c1 + 2]),
                                };
                              }
                              break;
                            case "SEQUENCE OF":
                              val += " " + Symbols[c1 + 2];
                              c1 = c1 + 2;
                              break;
                            default:
                              break;
                          }
                          //SYNTAX value
                          snmpObject[ObjectName][key] = val;
                          break;
                        case "DESCRIPTION":
                          if (!snmpObject[ObjectName][key]) {
                            snmpObject[ObjectName][key] = val;
                          }
                          if (!snmpObject[ObjectName]["REVISIONS-DESCRIPTIONS"]) {
                            snmpObject[ObjectName]["REVISIONS-DESCRIPTIONS"] = [];
                          }
                          (snmpObject[ObjectName]["REVISIONS-DESCRIPTIONS"] as unknown[]).push({
                            type: "DESCRIPTION",
                            value: val,
                          });
                          break;
                        case "REVISION":
                          if (!snmpObject[ObjectName]["REVISIONS-DESCRIPTIONS"]) {
                            snmpObject[ObjectName]["REVISIONS-DESCRIPTIONS"] = [];
                          }
                          (snmpObject[ObjectName]["REVISIONS-DESCRIPTIONS"] as unknown[]).push({
                            type: "REVISION",
                            value: val,
                          });
                          break;
                        default:
                          snmpObject[ObjectName][key] = val;
                          break;
                      }
                    }
                  }
                  snmpObject[Symbols[r - 1]].ObjectName = Symbols[r - 1];
                  snmpObject[Symbols[r - 1]].ModuleName = ModuleName;
                  snmpObject[Symbols[r - 1]]["OBJECT IDENTIFIER"] = Symbols[i + 1]
                    .replace("{", "")
                    .replace("}", "")
                    .trim()
                    .replace(/\s+/, " ");

                  if (snmpObject[Symbols[r - 1]]["OBJECT IDENTIFIER"] == "0 0") {
                    snmpObject[Symbols[r - 1]].OID = "0.0";
                    snmpObject[Symbols[r - 1]].NameSpace = "null";
                  } else {
                    this.OID(
                      snmpObject[Symbols[r - 1]]["OBJECT IDENTIFIER"],
                      "",
                      Symbols[r - 1],
                      "",
                      /* eslint-disable-next-line @typescript-eslint/no-loop-func */
                      function (ID, OD) {
                        snmpObject[Symbols[r - 1]].OID = ID;
                        snmpObject[Symbols[r - 1]].NameSpace = OD;
                        //snmpObject[Symbols[r - 1]]['ModuleName'] = ModuleName;
                        //snmpObject[Symbols[r - 1]]['ObjectName'] = Symbols[r - 1];
                      },
                    );
                  }
                  if (
                    snmpObject[Symbols[r - 1]]["REVISIONS-DESCRIPTIONS"] &&
                    (
                      snmpObject[Symbols[r - 1]]["REVISIONS-DESCRIPTIONS"] as Record<
                        string,
                        unknown
                      >[]
                    ).length == 1 &&
                    (
                      snmpObject[Symbols[r - 1]]["REVISIONS-DESCRIPTIONS"] as Record<
                        string,
                        unknown
                      >[]
                    )[0].type == "DESCRIPTION"
                  ) {
                    delete snmpObject[Symbols[r - 1]]["REVISIONS-DESCRIPTIONS"];
                  }
                }
              } else {
                //if OBJECT IDENTIFIER tag is NOT NEXT, check prior symbol for processing instructions / MARCO creation.
                switch (Symbols[i - 1]) {
                  case "DEFINITIONS":
                    break;
                  case "OBJECT IDENTIFIER":
                    break;
                  case "MACRO":
                    snmpObject = snmpObject[Symbols[i - 2]] = {};
                    MACROName = Symbols[i - 2];
                    break;
                  case "VALUE NOTATION":
                  case "TYPE NOTATION": {
                    snmpObject[Symbols[i - 1]] = {};
                    let j = i + 1;
                    while (Symbols[j + 1] != "::=" && Symbols[j + 1] != "END") {
                      if (Symbols[j].startsWith('"')) {
                        let value = Symbols[j + 1];
                        let t = j + 1;
                        if (Symbols[j + 2].startsWith("(")) {
                          value = Symbols[j + 2];
                          t = j + 2;
                        }
                        snmpObject[Symbols[i - 1]][Symbols[j].replace(/"/g, "")] = value;
                        j = t;
                      } else {
                        snmpObject[Symbols[i - 1]][Symbols[j]] = null;
                        if (Symbols[j + 1].startsWith("(")) {
                          snmpObject[Symbols[i - 1]][Symbols[j]] = Symbols[j + 1];
                          j++;
                        }
                      }
                      j++;
                    }
                    // Workaround for lack of INDEX, AUGMENTS and ACCESS in OBJECT-TYPE MACRO "TYPE NOTATION"
                    if (ModuleName == "SNMPv2-SMI") {
                      snmpObject["TYPE NOTATION"].INDEX = "Index";
                      snmpObject["TYPE NOTATION"].AUGMENTS = "Augments";
                      snmpObject["TYPE NOTATION"].ACCESS = "Access";
                    } else if (ModuleName == "RFC-1212") {
                      snmpObject["TYPE NOTATION"].INDEX = "Index";
                      snmpObject["TYPE NOTATION"].ACCESS = "Access";
                    }
                    // End INDEX/AUGMENTS workaround
                    break;
                  }
                  default:
                    //new object
                    snmpObject[Symbols[i - 1]] = {};
                    snmpObject[Symbols[i - 1]].ObjectName = Symbols[i - 1];
                    snmpObject[Symbols[i - 1]].ModuleName = ModuleName;
                    snmpObject[Symbols[i - 1]].MACRO = Symbols[i + 1];
                    this.BuildObject(snmpObject, Symbols[i - 1], Symbols[i + 1], i, Symbols);
                    break;
                }
              }
              break;
            case "END":
              if (MACROName != "") {
                //ADD macros to root for easier processing
                //Still need Import feature
                this[MACROName] = snmpObject;
                this.MACROS.push(MACROName);
              }
              //reset Object to Module root;
              snmpObject = Module;
              MACROName = "";
              break;
            case "IMPORTS": {
              //console.log(ModuleName, 'IMPORTS');
              //i++;
              Module.IMPORTS = {};
              let tmp = i + 1;
              let IMPORTS = [];
              while (Symbols[tmp] != ";") {
                if (Symbols[tmp] == "FROM") {
                  const ImportModule = Symbols[tmp + 1];
                  if (!Object.keys(this.Modules).includes(ImportModule)) {
                    console.log(
                      ModuleName + ": Can not find " + ImportModule + "!!!!!!!!!!!!!!!!!!!!!",
                    );
                    console.log(ModuleName + ": Can not import ", IMPORTS);
                    showMessage("warn", `Local MIB files missing depenency: ${ImportModule}`);
                  }
                  Module.IMPORTS[ImportModule] = IMPORTS;
                  tmp++;
                  IMPORTS = [];
                } else if (Symbols[tmp] != ",") {
                  IMPORTS.push(Symbols[tmp]);
                }
                tmp++;
              }
              //console.log(ModuleName, 'IMPORTS', Module['IMPORTS']);
              break;
            }
            case "EXPORTS":
              //console.log(ModuleName, 'EXPORTS');
              break;
            default:
              break;
          }
        }
      }
    }
  }

  GetRanges(mibRanges: string) {
    const rangeStrings = mibRanges
      .replace(/ */g, "")
      .replace(/\(SIZE/, "")
      .replace(/\)/, "")
      .replace(/\(/, "")
      .replace(/\)/, "")
      .split("|");

    const ranges = [];
    for (const rangeString of rangeStrings) {
      if (rangeString.includes("..")) {
        const range = rangeString.split("..");
        ranges.push({
          min: parseInt(range[0], 10),
          max: parseInt(range[1], 10),
        });
      } else {
        ranges.push({
          min: parseInt(rangeString, 10),
          max: parseInt(rangeString, 10),
        });
      }
    }
    return ranges;
  }

  BuildObject(
    snmpObject: Record<string, MibObject>,
    ObjectName: string,
    macro: string,
    i: number,
    Symbols: string[],
  ) {
    const syntaxKeyword = Symbols.indexOf("SYNTAX", i);
    const m = syntaxKeyword - i;
    let c1 = syntaxKeyword + 1;
    const SYNTAX = Symbols[c1];
    let val: string | string[];
    val = Symbols[c1 + 1];

    if (this.MACROS.includes(macro) && m < 10) {
      if (val.startsWith("{")) {
        c1++;
        while (!Symbols[c1].includes("}")) {
          c1++;
          val += Symbols[c1].trim();
        }
        val = val.replace("{", "").replace("}", "").split(",");

        snmpObject[ObjectName].SYNTAX = {};
        snmpObject[ObjectName].SYNTAX[SYNTAX] = {};

        for (const TC of val) {
          const openParenSplit = TC.split(/\s*\(\s*/);
          (snmpObject[ObjectName].SYNTAX[SYNTAX] as Record<string, string>)[
            openParenSplit[1].replace(/\s*\)\s*$/, "")
          ] = openParenSplit[0].trimStart();
        }
      } else if (val.startsWith("(")) {
        const key = val.startsWith("(SIZE") ? "sizes" : "ranges";
        snmpObject[ObjectName].SYNTAX = {};
        snmpObject[ObjectName].SYNTAX[SYNTAX] = { [key]: this.GetRanges(val) };
      } else {
        snmpObject[ObjectName].SYNTAX = SYNTAX;
      }
    }
  }

  GetSummary(callback: (summary: string) => void) {
    let summary = "";
    for (const ModuleName in this.Modules) {
      if (Object.keys(this.Modules).includes(ModuleName)) {
        for (const ObjectName in this.Modules[ModuleName]) {
          if (Object.keys(this.Modules[ModuleName]).includes(ObjectName)) {
            if (this.Modules[ModuleName][ObjectName].OID) {
              //OID
              summary += `${this.Modules[ModuleName][ObjectName].OID ?? ""} : ${ObjectName}\r\n`;
              //callback(this.Modules[ModuleName][ObjectName]);
              //break;
            }
          }
        }
      }
    }
    callback(summary);
  }

  OID(
    OBJECT_IDENTIFIER: string,
    ID: string,
    ObjectName: string,
    OD: string,
    callback: (ID: string, OD: string) => void,
  ) {
    const members = OBJECT_IDENTIFIER.split(" ");
    const parent = members.shift();
    const oid = members.pop();
    if (parent == "iso") {
      const midID = ["1"];
      const midOD = ["iso"];
      for (const entry of members) {
        const match = entry.match(/(.*)\((.+)\)$/);
        midID.push(match[2]);
        midOD.push(match[1]);
      }
      midID.push(oid);
      if (ID != "") {
        midID.push(ID);
      }
      if (OD != "") {
        midOD.push(OD);
      }
      midOD.push(ObjectName);
      callback(midID.join("."), midOD.join("."));
      return;
    }
    ID = ID == "" ? oid : [oid, ID].join(".");
    OD = OD == "" ? parent : [parent, OD].join(".");
    for (const ModuleName in this.Modules) {
      if (Object.keys(this.Modules).includes(ModuleName)) {
        if ((this.Modules[ModuleName] as Record<string, Record<string, unknown>>)[parent]) {
          this.OID(
            (
              (this.Modules[ModuleName] as Record<string, unknown>)[parent] as Record<
                string,
                unknown
              >
            )["OBJECT IDENTIFIER"] as string,
            ID,
            ObjectName,
            OD,
            callback,
          );
          break;
        }
      }
    }
  }
}

/**
 * MIB Module store
 */
export class MibModuleStore {
  private path: string;
  private parser: MibParser;
  private BASE_MODULES = [
    "SNMPv2-SMI",
    "SNMPv2-TC",
    "RFC1155-SMI",
    "RFC1158-MIB",
    "RFC1212-MIB",
    "RFC1213-MIB",
    "SNMPv2-CONF",
    "SNMPv2-MIB",
    "INET-ADDRESS-MIB",
  ];

  constructor(basePath?: string) {
    this.path = basePath ?? path.resolve(__filename, "..", "..", "src", "assets", "mibs");
    this.parser = new MibParser(this.path);
    this.loadBaseModules();
  }

  private loadBaseModules() {
    for (const mibModule of this.BASE_MODULES) {
      this.parser.Import(path.resolve(this.path, `${mibModule}.mib`));
    }
    this.parser.Serialize();
  }

  loadFromFile(filePath: string) {
    this.parser.Import(filePath);
    this.parser.Serialize();
  }

  getModule(moduleName: string) {
    return this.parser.Modules[moduleName];
  }

  getAllModules() {
    return this.parser.Modules;
  }

  getAllOidInfos() {
    return Object.values(this.getAllModules())
      .flatMap(oidModule => Object.values(oidModule))
      .filter(oidObject => oidObject.OID !== undefined)
      .map(
        oid =>
          ({
            description: (oid.DESCRIPTION ?? "").replace(/[\n,\t,\r]/gm, ""),
            index: oid.INDEX,
            maxAccess: oid.ACCESS ?? oid["MAX-ACCESS"],
            objectType: oid.ObjectName,
            status: oid.STATUS,
            syntax: oid.SYNTAX,
            oid: oid.OID,
            source: `Local MIB file \`${oid.ModuleName ?? ""}\``,
          } as OidInformation),
      );
  }
}
