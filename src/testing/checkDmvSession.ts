#!/usr/bin/env bun

import { PlateFinder, type PlateStatus } from "../plateFinder.js";
import { validatePlateCandidate } from "../plateRules.js";

const DEFAULT_SAMPLE_PLATE = "ABC123";

async function* createEmptyPlateGenerator(): AsyncGenerator<string> {
  for (const plate of [] as string[]) {
    yield plate;
  }
}

async function main(): Promise<void> {
  const inputPlates = process.argv.slice(2);
  const platesToCheck = inputPlates.length > 0 ? inputPlates : [DEFAULT_SAMPLE_PLATE];
  const finder = new PlateFinder(createEmptyPlateGenerator());
  const statuses: PlateStatus[] = [];

  console.log("Initializing DMV session...");
  await finder.initialize();
  console.log("DMV session initialized.");

  for (const plate of platesToCheck) {
    const validation = validatePlateCandidate(plate);
    if (!validation.valid) {
      console.error(`${validation.plate || plate}: INVALID_INPUT (${validation.errors.join("; ")})`);
      process.exitCode = 1;
      continue;
    }

    const status = await finder.getPlateStatus(validation.plate);
    statuses.push(status);
    console.log(`${validation.plate}: ${status}`);

    if (status === "ERROR") {
      process.exitCode = 1;
    }
  }

  if (statuses.length === 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(errorMessage);
  process.exit(1);
}
