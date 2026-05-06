import assert from "node:assert/strict";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

import {
  extractResponseOutputText,
  generatePlateCandidatesFromPrompt,
  type OpenAIResponseParser,
  normalizeGeneratedPlates,
} from "./platePromptGenerator.js";

assert.equal(extractResponseOutputText({ output_text: ' { "plates": ["SURF1"] } ' }), '{ "plates": ["SURF1"] }');

assert.equal(
  extractResponseOutputText({
    output: [
      {
        content: [
          {
            type: "output_text",
            text: '{"plates":["WAVE1","COAST"]}',
          },
        ],
      },
    ],
  }),
  '{"plates":["WAVE1","COAST"]}',
);

const normalized = normalizeGeneratedPlates([" abc123 ", "ABC123", "go car", "A0", "123ABC"]);
assert.deepEqual(normalized.plates, ["ABC123", "GO*CAR"]);
assert.equal(normalized.rejected.length, 2);
assert.ok(normalized.rejected.some((item) => item.plate === "A0" && item.errors.some((error) => error.includes("zero"))));
assert.ok(normalized.rejected.some((item) => item.plate === "123ABC" && item.errors.some((error) => error.includes("3-number/3-letter"))));

let capturedRequestBody: unknown;
const responseParser: OpenAIResponseParser = async (requestBody) => {
  capturedRequestBody = requestBody;
  return {
    output_parsed: { plates: ["SURF1", "WAVE2", "COAST"] },
    output_text: JSON.stringify({ plates: ["SURF1", "WAVE2", "COAST"] }),
    output: [],
    status: "completed",
    incomplete_details: null,
    error: null,
  };
};

const generated = await generatePlateCandidatesFromPrompt({
  prompt: "surf brands",
  count: 3,
  apiKey: "test-key",
  model: "gpt-5",
  responseParser,
});

assert.deepEqual(generated.plates, ["SURF1", "WAVE2", "COAST"]);
assert.equal(generated.model, "gpt-5");
const sdkRequestBody = capturedRequestBody as ResponseCreateParamsNonStreaming;
assert.deepEqual(
  {
    model: sdkRequestBody.model,
    maxOutputTokens: sdkRequestBody.max_output_tokens,
    reasoning: sdkRequestBody.reasoning,
    formatType: sdkRequestBody.text?.format?.type,
  },
  {
    model: "gpt-5",
    maxOutputTokens: 1000,
    reasoning: { effort: "minimal" },
    formatType: "json_schema",
  },
);

await assert.rejects(
  () =>
    generatePlateCandidatesFromPrompt({
      prompt: "surf brands",
      count: 3,
      apiKey: "test-key",
      responseParser: async () => ({
        output_parsed: null,
        output_text: "",
        output: [],
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        error: null,
      }),
    }),
  /max_output_tokens/,
);

await assert.rejects(
  () =>
    generatePlateCandidatesFromPrompt({
      prompt: "surf brands",
      count: 3,
      apiKey: "",
      responseParser,
    }),
  /OPENAI_API_KEY/,
);
