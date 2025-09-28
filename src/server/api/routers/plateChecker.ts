import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { tracked } from "@trpc/server";
import { PlateFinder } from "../../../plateFinder";

interface PlateResult {
  id: string;
  data: {
    plate: string;
    status: "AVAILABLE" | "UNAVAILABLE" | "ERROR" | "CHECKING";
    timestamp: Date;
    error?: string;
    totalChecked?: number;
  };
}

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
        plates: z.array(z.string().min(1).max(7)),
      }),
    )
    .subscription(async function* ({ input }) {
      let eventId = 0;
      let totalChecked = 0;
      const resultQueue: Array<{
        plate: string;
        status: "AVAILABLE" | "UNAVAILABLE" | "ERROR";
        error?: string;
      }> = [];

      try {
        yield tracked(String(eventId++), {
          plate: "SYSTEM",
          status: "CHECKING" as const,
          timestamp: new Date(),
          error: `Initializing ${PARALLEL_WORKERS} parallel DMV sessions...`,
        });

        // Initialize multiple PlateFinder instances for parallelization
        const plateFinders: PlateFinder[] = [];
        for (let i = 0; i < PARALLEL_WORKERS; i++) {
          const finder = new PlateFinder(createPlateGenerator([]));
          await finder.initialize();
          plateFinders.push(finder);
        }

        yield tracked(String(eventId++), {
          plate: "SYSTEM",
          status: "CHECKING" as const,
          timestamp: new Date(),
          error: `${PARALLEL_WORKERS} sessions initialized. Starting parallel plate checks...`,
        });

        // Process plates in parallel batches
        const processPlateBatch = async (plates: string[], startIdx: number) => {
          const promises = plates.map(async (plate, idx) => {
            const finderIdx = (startIdx + idx) % PARALLEL_WORKERS;
            const finder = plateFinders[finderIdx];

            if (!finder) {
              return {
                plate: plate.toUpperCase(),
                status: "ERROR" as const,
                error: "Finder instance not available",
              };
            }

            try {
              const status = await finder.getPlateStatus(plate);
              return {
                plate: plate.toUpperCase(),
                status: status === "AVAILABLE" ? "AVAILABLE" as const :
                       status === "ERROR" ? "ERROR" as const : "UNAVAILABLE" as const,
                ...(status === "ERROR" && { error: "Failed to check plate" }),
              };
            } catch (error) {
              return {
                plate: plate.toUpperCase(),
                status: "ERROR" as const,
                error: error instanceof Error ? error.message : "Unknown error",
              };
            }
          });

          return Promise.all(promises);
        };

        // Process plates in batches of PARALLEL_WORKERS
        for (let i = 0; i < input.plates.length; i += PARALLEL_WORKERS) {
          const batch = input.plates.slice(i, i + PARALLEL_WORKERS);

          // Emit "CHECKING" status for all plates in the batch
          for (const plate of batch) {
            yield tracked(String(eventId++), {
              plate: plate.toUpperCase(),
              status: "CHECKING" as const,
              timestamp: new Date(),
            });
          }

          // Process batch in parallel
          const results = await processPlateBatch(batch, i);

          // Emit results as they complete
          for (const result of results) {
            totalChecked++;
            yield tracked(String(eventId++), {
              ...result,
              timestamp: new Date(),
              totalChecked,
            });
          }
        }

        yield tracked(String(eventId++), {
          plate: "SYSTEM",
          status: "CHECKING" as const,
          timestamp: new Date(),
          error: `Completed checking ${totalChecked} plates.`,
        });
      } catch (error) {
        yield tracked(String(eventId++), {
          plate: "SYSTEM",
          status: "ERROR" as const,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }),

  quickCheck: publicProcedure
    .input(
      z.object({
        plate: z.string().min(1).max(7),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const plateGenerator = createPlateGenerator([input.plate]);
        const plateFinder = new PlateFinder(plateGenerator);

        await plateFinder.initialize();
        const status = await plateFinder.getPlateStatus(input.plate);

        return {
          plate: input.plate.toUpperCase(),
          status: status === "AVAILABLE" ? "AVAILABLE" :
                 status === "ERROR" ? "ERROR" : "UNAVAILABLE",
          timestamp: new Date(),
          ...(status === "ERROR" && { error: "Failed to check plate" }),
        };
      } catch (error) {
        return {
          plate: input.plate.toUpperCase(),
          status: "ERROR" as const,
          timestamp: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
});