#!/usr/bin/env node

import { PlateFinder } from "./plateFinder.js";
import { existsSync } from "fs";
import { createReadStream, writeFileSync } from "fs";
import { createInterface } from "readline";
import { combinationsWithReplacement } from "combinatorial-generators";
import {
  formatPlateForDisplay,
  MAX_PERSONALIZED_PLATE_LENGTH,
  MIN_PERSONALIZED_PLATE_LENGTH,
  validatePlateCandidate,
} from "./plateRules.js";

const NUM_PARALLEL = Number(process.env.NUM_PARALLEL || 50);

const COMBO_LENGTH = 3;

async function* getNextPlate(): AsyncGenerator<string> {
  yield "TEST"; // Initial yield for the instantiation call
  const platesFile = "plates.txt";

  // Check if plates.txt exists
  if (existsSync(platesFile)) {
    console.log(`Reading plates from ${platesFile}...`);

    // Stream lines from the file
    const fileStream = createReadStream(platesFile);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity, // Handle both \n and \r\n line endings
    });

    for await (const line of rl) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      const validation = validatePlateCandidate(trimmedLine);
      if (validation.valid) {
        yield validation.plate;
      } else {
        console.warn(`Skipping invalid plate ${formatPlateForDisplay(validation.plate || trimmedLine)}: ${validation.errors.join("; ")}`);
      }
    }
  } else {
    console.log(`No plates.txt found, generating ${COMBO_LENGTH}-character combinations...`);

    // Fall back to generating combinations
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";

    for (const combo of combinationsWithReplacement(chars, COMBO_LENGTH)) {
      yield combo.join("");
    }
  }
}

async function main(): Promise<void> {
  // Record the start time for performance measurement
  const startTime = Date.now();

  // Create and initialize worker instances with their own generators
  const workers: PlateFinder[] = [];
  const workerPromises: Promise<void>[] = [];
  const plateGenerator = getNextPlate();

  await Promise.all(
    Array.from({ length: NUM_PARALLEL }).map(async () => {
      const worker = new PlateFinder(plateGenerator);
      await worker.initialize();
      workers.push(worker);
      workerPromises.push(worker.run());
    }),
  );

  // Wait for all workers to complete
  await Promise.all(workerPromises);

  // collect all the available plates and log them
  const allAvailablePlates = workers.flatMap((worker) => worker.availablePlates);
  const numPlatesChecked = workers.reduce((sum, worker) => sum + worker.platesChecked, 0);
  console.log(`\nFound ${allAvailablePlates.length}/${numPlatesChecked} available plates:`);
  // write this to available-plates.txt
  const outputFile = "available-plates.txt";
  const fileContent = allAvailablePlates.sort().map(formatPlateForDisplay).join("\n");
  writeFileSync(outputFile, fileContent);
  console.log(`Available plates written to ${outputFile}`);
  // Calculate and display the total execution time
  const endTime = Date.now();
  const totalDuration = (endTime - startTime) / 1000;
  console.log(`\nTotal Time: ${totalDuration.toFixed(2)} seconds`);
  console.log(
    `Plate rules: California 1960s Legacy personalized plates use ${MIN_PERSONALIZED_PLATE_LENGTH}-${MAX_PERSONALIZED_PLATE_LENGTH} characters.`,
  );
  process.exit(0);
}

await main();
