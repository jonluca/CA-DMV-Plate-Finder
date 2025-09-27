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

export const plateCheckerRouter = createTRPCRouter({
  checkPlates: publicProcedure
    .input(
      z.object({
        plates: z.array(z.string().min(1).max(7)),
      }),
    )
    .subscription(async function* ({ input }) {
      const plateGenerator = createPlateGenerator(input.plates);
      const plateFinder = new PlateFinder(plateGenerator);

      let eventId = 0;

      try {
        yield tracked(String(eventId++), {
          plate: "SYSTEM",
          status: "CHECKING" as const,
          timestamp: new Date(),
          error: "Initializing DMV session...",
        });

        await plateFinder.initialize();

        yield tracked(String(eventId++), {
          plate: "SYSTEM",
          status: "CHECKING" as const,
          timestamp: new Date(),
          error: "Session initialized. Starting plate checks...",
        });

        for (const plate of input.plates) {
          yield tracked(String(eventId++), {
            plate: plate.toUpperCase(),
            status: "CHECKING" as const,
            timestamp: new Date(),
          });

          try {
            const status = await plateFinder.getPlateStatus(plate);

            yield tracked(String(eventId++), {
              plate: plate.toUpperCase(),
              status: status === "AVAILABLE" ? "AVAILABLE" as const :
                     status === "ERROR" ? "ERROR" as const : "UNAVAILABLE" as const,
              timestamp: new Date(),
              totalChecked: plateFinder.platesChecked,
              ...(status === "ERROR" && { error: "Failed to check plate" }),
            });
          } catch (error) {
            yield tracked(String(eventId++), {
              plate: plate.toUpperCase(),
              status: "ERROR" as const,
              timestamp: new Date(),
              error: error instanceof Error ? error.message : "Unknown error",
              totalChecked: plateFinder.platesChecked,
            });
          }
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