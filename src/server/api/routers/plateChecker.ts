import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { observable } from "@trpc/server/observable";
import { PlateFinder } from "../../../plateFinder";

interface PlateResult {
  plate: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "ERROR" | "CHECKING";
  timestamp: Date;
  error?: string;
  totalChecked?: number;
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
    .subscription(({ input }) => {
      return observable<PlateResult>((emit) => {
        let isSubscribed = true;

        const runPlateChecker = async () => {
          try {
            const plateGenerator = createPlateGenerator(input.plates);
            const plateFinder = new PlateFinder(plateGenerator);

            await emit.next({
              plate: "SYSTEM",
              status: "CHECKING",
              timestamp: new Date(),
              error: "Initializing DMV session...",
            });

            await plateFinder.initialize();

            await emit.next({
              plate: "SYSTEM",
              status: "CHECKING",
              timestamp: new Date(),
              error: "Session initialized. Starting plate checks...",
            });

            for (const plate of input.plates) {
              if (!isSubscribed) break;

              await emit.next({
                plate: plate.toUpperCase(),
                status: "CHECKING",
                timestamp: new Date(),
              });

              try {
                const status = await plateFinder.getPlateStatus(plate);

                await emit.next({
                  plate: plate.toUpperCase(),
                  status: status === "AVAILABLE" ? "AVAILABLE" :
                         status === "ERROR" ? "ERROR" : "UNAVAILABLE",
                  timestamp: new Date(),
                  totalChecked: plateFinder.platesChecked,
                  ...(status === "ERROR" && { error: "Failed to check plate" }),
                });
              } catch (error) {
                await emit.next({
                  plate: plate.toUpperCase(),
                  status: "ERROR",
                  timestamp: new Date(),
                  error: error instanceof Error ? error.message : "Unknown error",
                  totalChecked: plateFinder.platesChecked,
                });
              }
            }
          } catch (error) {
            await emit.next({
              plate: "SYSTEM",
              status: "ERROR",
              timestamp: new Date(),
              error: error instanceof Error ? error.message : "Unknown error occurred",
            });
          }
        };

        void runPlateChecker();

        return () => {
          isSubscribed = false;
        };
      });
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