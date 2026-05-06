## Stage 1: Stream Progress Events
**Goal**: Emit useful progress events from the OpenAI response stream.
**Success Criteria**: The generator stream forwards API lifecycle/status information before and during text output.
**Tests**: Update the generator stream test to expect progress events.
**Status**: Complete

## Stage 2: Progress UI
**Goal**: Show generation progress while "Generate and check ideas" is running.
**Success Criteria**: The UI displays the latest OpenAI stream event, response status when available, and generated candidate count.
**Tests**: Typecheck/build coverage through the project test command.
**Status**: Complete

## Stage 3: Verification
**Goal**: Confirm the change does not regress existing behavior.
**Success Criteria**: Existing test suite passes.
**Tests**: `bun test` or project test command.
**Status**: In Progress
