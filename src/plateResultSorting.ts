export type PlateResultStatus = "AVAILABLE" | "UNAVAILABLE" | "INVALID" | "ERROR" | "CHECKING";
export type PlateResultSortField = "plate" | "status" | "timestamp";
export type PlateResultSortDirection = "asc" | "desc";

export interface SortablePlateResult {
  plate: string;
  status: PlateResultStatus;
  timestamp: Date;
}

const STATUS_SORT_ORDER: Record<PlateResultStatus, number> = {
  AVAILABLE: 0,
  CHECKING: 1,
  INVALID: 2,
  ERROR: 3,
  UNAVAILABLE: 4,
};

function comparePlateResults(a: SortablePlateResult, b: SortablePlateResult, sortField: PlateResultSortField): number {
  switch (sortField) {
    case "plate":
      return a.plate.localeCompare(b.plate);
    case "status":
      return STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    case "timestamp":
      return a.timestamp.getTime() - b.timestamp.getTime();
  }
}

export function sortPlateResults<T extends SortablePlateResult>(
  results: T[],
  sortField: PlateResultSortField,
  sortDirection: PlateResultSortDirection,
): T[] {
  return [...results].sort((a, b) => {
    const comparison = comparePlateResults(a, b, sortField);
    return sortDirection === "asc" ? comparison : -comparison;
  });
}
