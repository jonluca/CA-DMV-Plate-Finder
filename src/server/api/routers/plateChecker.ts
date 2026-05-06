import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { tracked } from "@trpc/server";
import { PlateFinder } from "~/plateFinder";
import { pMapIterable } from "p-map";
import { MAX_PLATES_PER_CHECK, uniquePlateCandidates, validatePlateCandidate } from "~/plateRules";

async function* createPlateGenerator(plates: string[]): AsyncGenerator<string> {
  for (const plate of plates) {
    yield plate;
  }
}

const PARALLEL_WORKERS = 10;

export const plateCheckerRouter = createTRPCRouter({
  checkPlates: publicProcedure
    .input(
      z.object({
        plates: z
          .array(z.string().min(1).max(32))
          .min(1)
          .transform(uniquePlateCandidates)
          .pipe(z.array(z.string()).min(1).max(MAX_PLATES_PER_CHECK)),
      }),
    )
    .subscription(async function* ({ input }) {
      let eventId = 0;
      let totalChecked = 0;

      try {
        const validPlates: string[] = [];
        const invalidPlates: Array<{ plate: string; errors: string[] }> = [];

        for (const plate of input.plates) {
          const validation = validatePlateCandidate(plate);

          if (!validation.valid) {
            invalidPlates.push({ plate: validation.plate || plate.toUpperCase(), errors: validation.errors });
            continue;
          }

          validPlates.push(validation.plate);
        }

        for (const invalidPlate of invalidPlates) {
          totalChecked++;
          yield tracked(String(eventId++), {
            plate: invalidPlate.plate,
            status: "INVALID" as const,
            timestamp: new Date(),
            error: invalidPlate.errors.join(" "),
            totalChecked,
          });
        }

        if (validPlates.length === 0) {
          return;
        }

        // Initialize multiple PlateFinder instances for parallelization
        const plateFinders: PlateFinder[] = [];
        for (let i = 0; i < PARALLEL_WORKERS; i++) {
          const finder = new PlateFinder(createPlateGenerator([]));
          await finder.initialize();
          plateFinders.push(finder);
        }

        const resultsIterable = pMapIterable(
          validPlates,
          async (plate, index) => {
            const finder = plateFinders[index % plateFinders.length]!;

            try {
              const status = await finder.getPlateStatus(plate);
              return {
                plate,
                status:
                  status === "AVAILABLE"
                    ? ("AVAILABLE" as const)
                    : status === "ERROR"
                      ? ("ERROR" as const)
                      : status === "INVALID"
                        ? ("INVALID" as const)
                        : ("UNAVAILABLE" as const),
                timestamp: new Date(),
                ...(status === "ERROR" && { error: "Failed to check plate" }),
                ...(status === "INVALID" && { error: "DMV rejected the plate configuration." }),
              };
            } catch (error) {
              return {
                plate,
                status: "ERROR" as const,
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: new Date(),
              };
            }
          },
          { concurrency: PARALLEL_WORKERS },
        );

        // Yield results as they complete
        for await (const result of resultsIterable) {
          totalChecked++;
          yield tracked(String(eventId++), {
            ...result,
            totalChecked,
          });
        }
      } catch (error) {
        yield tracked(String(eventId), {
          plate: "SYSTEM",
          status: "ERROR" as const,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }),
});
