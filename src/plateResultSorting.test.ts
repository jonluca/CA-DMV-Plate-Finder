import assert from "node:assert/strict";

import { sortPlateResults, type SortablePlateResult } from "./plateResultSorting.js";

const results: SortablePlateResult[] = [
  { plate: "TAKEN", status: "UNAVAILABLE", timestamp: new Date("2026-01-01T00:00:03.000Z") },
  { plate: "BAD", status: "INVALID", timestamp: new Date("2026-01-01T00:00:02.000Z") },
  { plate: "HIT", status: "AVAILABLE", timestamp: new Date("2026-01-01T00:00:01.000Z") },
  { plate: "WAIT", status: "CHECKING", timestamp: new Date("2026-01-01T00:00:04.000Z") },
  { plate: "ERR", status: "ERROR", timestamp: new Date("2026-01-01T00:00:05.000Z") },
];

assert.deepEqual(
  sortPlateResults(results, "status", "asc").map((result) => result.status),
  ["AVAILABLE", "CHECKING", "INVALID", "ERROR", "UNAVAILABLE"],
);

assert.deepEqual(
  sortPlateResults(results, "status", "desc").map((result) => result.status),
  ["UNAVAILABLE", "ERROR", "INVALID", "CHECKING", "AVAILABLE"],
);

assert.deepEqual(
  sortPlateResults(results, "timestamp", "desc").map((result) => result.plate),
  ["ERR", "WAIT", "TAKEN", "BAD", "HIT"],
);
