import assert from "node:assert/strict";

import {
  MAX_PERSONALIZED_PLATE_LENGTH,
  MIN_PERSONALIZED_PLATE_LENGTH,
  parsePlateCandidates,
  validatePlateCandidate,
} from "./plateRules.js";

function assertValid(input: string, expected: string): void {
  const result = validatePlateCandidate(input);

  assert.equal(result.valid, true, input);
  assert.equal(result.plate, expected);
}

function assertInvalid(input: string, expectedError: string): void {
  const result = validatePlateCandidate(input);

  assert.equal(result.valid, false, input);
  assert.ok(
    result.errors.some((error) => error.includes(expectedError)),
    `${input}: ${result.errors.join("; ")}`,
  );
}

assert.equal(MIN_PERSONALIZED_PLATE_LENGTH, 2);
assert.equal(MAX_PERSONALIZED_PLATE_LENGTH, 7);

assert.deepEqual(parsePlateCandidates("abc123, abc123\nxy; go/car"), ["ABC123", "XY", "GO/CAR"]);

assertValid(" ca1969 ", "CA1969");
assertValid("go/car", "GO/CAR");
assertValid("go*car", "GO*CAR");
assertValid("go car", "GO*CAR");

assertInvalid("A", "2-7 characters");
assertInvalid("ABCDEFGH", "2-7 characters");
assertInvalid("A0", "zero");
assertInvalid("A-", "Use only letters");
assertInvalid("*/", "at least two letters or numbers");

assertInvalid("123AA", "3-number/2-letter");
assertInvalid("123SAM", "3-number/3-letter");
assertInvalid("1234AB", "4-number/2-letter");
assertInvalid("12345R", "5-number/1-letter");
assertInvalid("12345DP", "5-number/2-letter");
assertInvalid("11111A1", "5-number/1-letter/1-number");
assertInvalid("1234567", "7-number");
