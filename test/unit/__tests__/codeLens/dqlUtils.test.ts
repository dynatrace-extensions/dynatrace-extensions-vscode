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

import { prepareDqlQuery } from "../../../../src/codeLens/utils/dqlUtils";

describe("prepareDqlQuery", () => {
  const wrap = (dqlValue: string) => `"dqlQuery": ${dqlValue}`;

  describe("string form", () => {
    it("returns the query string value", () => {
      const text = wrap('"fetch logs | limit 10"');
      const result = prepareDqlQuery(text, 0);
      expect(result).toBe("fetch logs | limit 10");
    });

    it("returns null when value is empty", () => {
      const text = wrap('""');
      const result = prepareDqlQuery(text, 0);
      expect(result).toBe("");
    });

    it("handles escape sequences in query string", () => {
      const text = wrap('"fetch logs\\n| limit 10"');
      const result = prepareDqlQuery(text, 0);
      expect(result).toBe("fetch logs\\n| limit 10");
    });
  });

  describe("object form — base query only", () => {
    it("returns base query when no lookups or additionalCommands", () => {
      const obj = JSON.stringify({ idField: "id", query: "smartscapeNodes FOO | limit 10" });
      const text = wrap(obj);
      const result = prepareDqlQuery(text, 0);
      expect(result).toBe("smartscapeNodes FOO | limit 10");
    });
  });

  describe("object form — with lookups", () => {
    it("appends lookup as piped command", () => {
      const obj = JSON.stringify({
        idField: "id",
        query: "smartscapeNodes FOO",
        lookups: [
          {
            query: "smartscapeNodes BAR | fieldsAdd status",
            sourceField: "fooId",
            lookupField: "id",
            fields: ["status"],
          },
        ],
      });
      const text = wrap(obj);
      const result = prepareDqlQuery(text, 0);
      expect(result).toContain("smartscapeNodes FOO");
      expect(result).toContain("| lookup [ smartscapeNodes BAR | fieldsAdd status ]");
      expect(result).toContain("sourceField: fooId");
      expect(result).toContain("lookupField: id");
      expect(result).toContain("fields: { status }");
    });

    it("appends multiple lookups in order", () => {
      const obj = JSON.stringify({
        idField: "id",
        query: "smartscapeNodes FOO",
        lookups: [
          {
            query: "smartscapeNodes BAR",
            sourceField: "fooId",
            lookupField: "id",
            fields: ["a", "b"],
          },
          {
            query: "smartscapeNodes BAZ",
            sourceField: "fooId",
            lookupField: "id",
            fields: ["c"],
          },
        ],
      });
      const text = wrap(obj);
      const result = prepareDqlQuery(text, 0);
      const lines = result!.split("\n");
      expect(lines[0]).toContain("smartscapeNodes FOO");
      expect(lines[1]).toContain("smartscapeNodes BAR");
      expect(lines[2]).toContain("smartscapeNodes BAZ");
    });

    it("skips AlertLookup entries (builtInLookup)", () => {
      const obj = JSON.stringify({
        idField: "id",
        query: "smartscapeNodes FOO",
        lookups: [
          { builtInLookup: "ALERTS_LOOKUP", filterExpression: 'in(types, "FOO")' },
          {
            query: "smartscapeNodes BAR",
            sourceField: "fooId",
            lookupField: "id",
            fields: ["x"],
          },
        ],
      });
      const text = wrap(obj);
      const result = prepareDqlQuery(text, 0);
      expect(result).not.toContain("ALERTS_LOOKUP");
      expect(result).toContain("smartscapeNodes BAR");
    });
  });

  describe("object form — with additionalCommands", () => {
    it("appends additional commands as pipe stages", () => {
      const obj = JSON.stringify({
        idField: "id",
        query: "smartscapeNodes FOO",
        additionalCommands: [
          { query: "fieldsAdd derived = cpu + mem", dependencies: ["cpu", "mem"], fields: ["derived"] },
        ],
      });
      const text = wrap(obj);
      const result = prepareDqlQuery(text, 0);
      expect(result).toContain("| fieldsAdd derived = cpu + mem");
    });
  });

  describe("object form — combined", () => {
    it("assembles query + lookups + additionalCommands in correct order", () => {
      const obj = JSON.stringify({
        idField: "id",
        query: "smartscapeNodes FOO",
        lookups: [
          {
            query: "smartscapeNodes BAR",
            sourceField: "fooId",
            lookupField: "id",
            fields: ["status"],
          },
        ],
        additionalCommands: [{ query: "fieldsAdd x = 1", dependencies: [], fields: ["x"] }],
      });
      const text = wrap(obj);
      const result = prepareDqlQuery(text, 0);
      const lines = result!.split("\n");
      expect(lines[0]).toBe("smartscapeNodes FOO");
      expect(lines[1]).toContain("lookup [");
      expect(lines[2]).toContain("| fieldsAdd x = 1");
    });
  });

  describe("fallback behaviour", () => {
    it("returns null when no dqlQuery match", () => {
      const result = prepareDqlQuery('"someOtherKey": "value"', 0);
      expect(result).toBeNull();
    });

    it("respects matchIndex offset", () => {
      const prefix = "xxxxx";
      const text = prefix + wrap('"smartscapeNodes FOO"');
      const result = prepareDqlQuery(text, prefix.length);
      expect(result).toBe("smartscapeNodes FOO");
    });
  });
});
