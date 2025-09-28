import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { tracked } from "@trpc/server";
import { PlateFinder } from "~/plateFinder";
import { pMapIterable } from "p-map";

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
        plates: z.array(z.string().min(1).max(1000)),
      }),
    )
    .subscription(async function* ({ input }) {
      let eventId = 0;
      let totalChecked = 0;

      try {
        // Initialize multiple PlateFinder instances for parallelization
        const plateFinders: PlateFinder[] = [];
        for (let i = 0; i < PARALLEL_WORKERS; i++) {
          const finder = new PlateFinder(createPlateGenerator([]));
          await finder.initialize();
          plateFinders.push(finder);
        }

        const plates = input.plates.slice(0, 1000);
        const resultsIterable = pMapIterable(
          plates,
          async (plate, index) => {
            const finder = plateFinders[index % plateFinders.length]!;

            try {
              const status = await finder.getPlateStatus(plate);
              return {
                plate: plate.toUpperCase(),
                status:
                  status === "AVAILABLE" ? ("AVAILABLE" as const) : status === "ERROR" ? ("ERROR" as const) : ("UNAVAILABLE" as const),
                timestamp: new Date(),
                ...(status === "ERROR" && { error: "Failed to check plate" }),
              };
            } catch (error) {
              return {
                plate: plate.toUpperCase(),
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
        yield tracked(String(eventId++), {
          plate: "SYSTEM",
          status: "ERROR" as const,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }),
});
