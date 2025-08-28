#!/usr/bin/env node

import { PlateFinder } from "./plateFinder.js";
import { existsSync } from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { combinationsWithReplacement } from "combinatorial-generators";

const NUM_PARALLEL = Number(process.env.NUM_PARALLEL || 10);
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
      if (trimmedLine) {
        yield trimmedLine;
      }
    }
  } else {
    console.log("No plates.txt found, generating 3-character combinations...");

    // Fall back to generating combinations
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    for (const combo of combinationsWithReplacement(chars, 3)) {
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

  // Clean up workers
  await Promise.all(workers.map((worker) => worker.close()));

  // Calculate and display the total execution time
  const endTime = Date.now();
  const totalDuration = (endTime - startTime) / 1000;
  console.log(`\nTotal Time: ${totalDuration.toFixed(2)} seconds`);
}

await main();
