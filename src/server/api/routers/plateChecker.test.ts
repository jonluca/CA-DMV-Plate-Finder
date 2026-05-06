import assert from "node:assert/strict";

import { mapAsCompleted } from "./plateChecker.js";

const delays: Record<string, number> = {
  slow: 30,
  fast: 1,
  medium: 10,
};

const completed: string[] = [];

for await (const result of mapAsCompleted(
  ["slow", "fast", "medium"],
  async (item) => {
    await new Promise((resolve) => setTimeout(resolve, delays[item]));
    return item;
  },
  3,
)) {
  completed.push(result);
}

assert.deepEqual(completed, ["fast", "medium", "slow"]);
