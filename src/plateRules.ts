export const MIN_PERSONALIZED_PLATE_LENGTH = 2;
export const MAX_PERSONALIZED_PLATE_LENGTH = 7;
export const MAX_PLATES_PER_CHECK = 1000;

const VALID_PLATE_CHARACTERS = /^[A-Z1-9*/]+$/;
const PLATE_TOKEN_SEPARATOR = /[,;\r\n]+/;

const REGULAR_SERIES_RESTRICTIONS = [
  {
    pattern: /^[1-9]{3}[A-E][A-Z]$/,
    message: "Conflicts with the DMV reserved 3-number/2-letter series.",
  },
  {
    pattern: /^[1-9]{3}[A-Z]{3}$/,
    message: "Conflicts with the DMV automobile 3-number/3-letter series.",
  },
  {
    pattern: /^[1-9]{4}[A-Z]{2}$/,
    message: "Conflicts with a DMV 4-number/2-letter regular plate series.",
  },
  {
    pattern: /^[1-9]{5}[A-Z]$/,
    message: "Conflicts with the DMV commercial 5-number/1-letter series.",
  },
  {
    pattern: /^[1-9]{5}[A-Z]{2}$/,
    message: "Conflicts with a DMV 5-number/2-letter regular plate series.",
  },
  {
    pattern: /^[1-9]{5}[A-Z][1-9]$/,
    message: "Conflicts with the DMV commercial 5-number/1-letter/1-number series.",
  },
  {
    pattern: /^[1-9]{7}$/,
    message: "Conflicts with the DMV 7-number exempt plate series.",
  },
] as const;

export type PlateValidationResult =
  | {
      valid: true;
      plate: string;
      errors: [];
    }
  | {
      valid: false;
      plate: string;
      errors: string[];
    };

export function normalizePlateCandidate(value: string): string {
  return value.trim().toUpperCase().replace(/\s/g, "*");
}

export function formatPlateForDisplay(plate: string): string {
  return plate.replace(/\*/g, " ");
}

export function parsePlateCandidates(text: string): string[] {
  const seen = new Set<string>();
  const plates: string[] = [];

  for (const token of text.split(PLATE_TOKEN_SEPARATOR)) {
    const plate = normalizePlateCandidate(token);

    if (!plate || seen.has(plate)) {
      continue;
    }

    seen.add(plate);
    plates.push(plate);
  }

  return plates;
}

export function validatePlateCandidate(value: string): PlateValidationResult {
  const plate = normalizePlateCandidate(value);
  const errors: string[] = [];

  if (plate.length < MIN_PERSONALIZED_PLATE_LENGTH || plate.length > MAX_PERSONALIZED_PLATE_LENGTH) {
    errors.push(
      `California 1960s Legacy personalized plates must be ${MIN_PERSONALIZED_PLATE_LENGTH}-${MAX_PERSONALIZED_PLATE_LENGTH} characters.`,
    );
  }

  if (plate.includes("0")) {
    errors.push("The DMV does not allow zero (0); use the letter O when appropriate.");
  }

  if (plate && !VALID_PLATE_CHARACTERS.test(plate)) {
    errors.push("Use only letters, digits 1-9, spaces for full spaces, and / for half-spaces.");
  }

  const visibleCharacters = plate.replace(/[*/]/g, "");
  if (visibleCharacters.length < MIN_PERSONALIZED_PLATE_LENGTH) {
    errors.push("A configuration must include at least two letters or numbers.");
  }

  const compactPlate = visibleCharacters;
  const restrictedSeries = REGULAR_SERIES_RESTRICTIONS.find(({ pattern }) => pattern.test(compactPlate));
  if (restrictedSeries) {
    errors.push(restrictedSeries.message);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      plate,
      errors,
    };
  }

  return {
    valid: true,
    plate,
    errors: [],
  };
}
