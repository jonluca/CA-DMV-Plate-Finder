import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { generatePlateCandidatesFromPrompt, MAX_GENERATED_PLATES } from "~/server/openai/platePromptGenerator";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const plateGeneratorRouter = createTRPCRouter({
  generate: publicProcedure
    .input(
      z.object({
        prompt: z.string().trim().min(3).max(1000),
        count: z.number().int().min(1).max(MAX_GENERATED_PLATES),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await generatePlateCandidatesFromPrompt(input);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate plate candidates.",
          cause: error,
        });
      }
    }),
});
