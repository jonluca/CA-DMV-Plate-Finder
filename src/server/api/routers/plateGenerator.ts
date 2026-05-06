import { TRPCError } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";

import { generatePlateCandidatesFromPrompt, generatePlateCandidatesFromPromptStream } from "~/server/openai/platePromptGenerator";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

const GeneratePlateInputSchema = z.object({
  prompt: z.string().trim().min(3).max(1000),
});

export const plateGeneratorRouter = createTRPCRouter({
  generate: publicProcedure.input(GeneratePlateInputSchema).mutation(async ({ input }) => {
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
  generateStream: publicProcedure
    .input(GeneratePlateInputSchema.extend({ requestId: z.number().int().nonnegative() }))
    .subscription(async function* ({ input }) {
      let eventId = 0;

      try {
        for await (const event of generatePlateCandidatesFromPromptStream({ prompt: input.prompt })) {
          yield tracked(String(eventId++), event);
        }
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to stream plate candidates.",
          cause: error,
        });
      }
    }),
});
