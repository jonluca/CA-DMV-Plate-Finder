#!/usr/bin/env node

import { PlateFinder } from "./plateFinder.js";
import { existsSync } from "fs";
import { createReadStream, writeFileSync } from "fs";
import { createInterface } from "readline";
import { combinationsWithReplacement } from "combinatorial-generators";

const NUM_PARALLEL = Number(process.env.NUM_PARALLEL || 50);

const MINIMUM_LENGTH = 2;
const MAXIMUM_LENGTH = 7;
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
      if (trimmedLine && trimmedLine.length >= MINIMUM_LENGTH && trimmedLine.length <= MAXIMUM_LENGTH) {
        yield trimmedLine;
      }
    }
  } else {
    console.log(`No plates.txt found, generating ${COMBO_LENGTH}-character combinations...`);

    // Fall back to generating combinations
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

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
  console.log(`\nFound ${allAvailablePlates.length} available plates:`);
  // write this to available-plates.txt
  const outputFile = "available-plates.txt";
  const fileContent = allAvailablePlates.sort().join("\n");
  writeFileSync(outputFile, fileContent);
  console.log(`Available plates written to ${outputFile}`);
  // Calculate and display the total execution time
  const endTime = Date.now();
  const totalDuration = (endTime - startTime) / 1000;
  console.log(`\nTotal Time: ${totalDuration.toFixed(2)} seconds`);
  process.exit(0);
}

await main();
