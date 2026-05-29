import { skipToken } from "@tanstack/react-query";
import Head from "next/head";
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  sortPlateResults,
  type PlateResultSortDirection as SortDirection,
  type PlateResultSortField as SortField,
  type PlateResultStatus,
} from "~/plateResultSorting";
import { formatPlateForDisplay, parsePlateCandidates, uniquePlateCandidates } from "~/plateRules";
import { api } from "~/utils/api";

interface PlateResult {
  plate: string;
  status: PlateResultStatus;
  timestamp: Date;
  error?: string;
  totalChecked?: number;
}

type FilterType = "all" | "available" | "unavailable" | "checking" | "invalid" | "error";

interface FilterOption {
  id: FilterType;
  label: string;
  count: number;
  activeClassName: string;
}

interface StatItem {
  label: string;
  value: number;
  className: string;
}

interface GenerationProgressState {
  message: string;
  generatedCount: number;
  updatedAt: Date;
  targetCount?: number;
}

const promptStarters = [
  {
    label: "Coastal",
    prompt: "Coastal sunset drives, ocean air, and surf weekends",
  },
  {
    label: "Electric",
    prompt: "Clean electric driving with clever future-focused wordplay",
  },
  {
    label: "Vintage",
    prompt: "Classic air-cooled sports car cruising California backroads",
  },
];

const statusStyles: Record<
  PlateResultStatus,
  {
    badgeClassName: string;
    dotClassName: string;
    rowClassName: string;
  }
> = {
  AVAILABLE: {
    badgeClassName: "border-[#8bd8a5] bg-[#e8f8ee] text-[#12642d]",
    dotClassName: "bg-[#2f9e53]",
    rowClassName: "border-l-[#2f9e53]",
  },
  UNAVAILABLE: {
    badgeClassName: "border-[#f1a09a] bg-[#fff0ee] text-[#9d241c]",
    dotClassName: "bg-[#d6453d]",
    rowClassName: "border-l-[#d6453d]",
  },
  INVALID: {
    badgeClassName: "border-[#efc86b] bg-[#fff7df] text-[#785300]",
    dotClassName: "bg-[#d89a13]",
    rowClassName: "border-l-[#d89a13]",
  },
  ERROR: {
    badgeClassName: "border-[#efc86b] bg-[#fff4d6] text-[#765100]",
    dotClassName: "bg-[#d89a13]",
    rowClassName: "border-l-[#d89a13]",
  },
  CHECKING: {
    badgeClassName: "border-[#8abde8] bg-[#e8f3ff] text-[#0a56a3]",
    dotClassName: "bg-[#0a6fbf]",
    rowClassName: "border-l-[#0a6fbf]",
  },
};

const getSortLabel = (field: SortField, sortField: SortField, sortDirection: SortDirection) => {
  return sortField === field ? sortDirection : "sort";
};

const formatPlateListForInput = (plateList: string[]) => plateList.map(formatPlateForDisplay).join("\n");

function MiniPlate({ plate }: { plate: string }) {
  return (
    <span className="inline-flex min-w-24 justify-center rounded-md border border-[#b5c2d2] bg-[#fbfcfe] px-3 py-1.5 font-mono text-sm font-black tracking-[0.12em] whitespace-pre text-[#101828] shadow-[inset_0_-2px_0_rgba(10,86,163,0.08)]">
      {formatPlateForDisplay(plate)}
    </span>
  );
}

function PanelHeader({ kicker, title, description, action }: { kicker: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold tracking-[0.16em] text-[#0a56a3] uppercase">{kicker}</p>
        <h2 className="mt-1 text-lg font-bold text-[#101828]">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-[#667587]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ stat }: { stat: StatItem }) {
  return (
    <div className="rounded-xl border border-[#e2e5e3] bg-white/80 p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-bold tracking-[0.12em] text-[#6a7787] uppercase">{stat.label}</p>
      <p className={`mt-2 text-2xl font-black tabular-nums ${stat.className}`}>{stat.value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: PlateResult["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${statusStyles[status].badgeClassName}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusStyles[status].dotClassName}`} aria-hidden="true" />
      {status}
    </span>
  );
}

function FilterButton({ option, isActive, onClick }: { option: FilterOption; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-bold transition focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none ${
        isActive ? option.activeClassName : "border-[#d8e0ea] bg-white text-[#526172] hover:border-[#9aaabd] hover:text-[#172033]"
      }`}
    >
      {option.label} <span className="tabular-nums">{option.count}</span>
    </button>
  );
}

function SortableHeader({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  return (
    <th className="px-5 py-3 text-left">
      <button
        type="button"
        className="flex items-center gap-2 text-xs font-black tracking-[0.12em] text-[#526172] uppercase transition hover:text-[#0a56a3]"
        onClick={() => onSort(field)}
      >
        {label}
        <span className="rounded-full border border-[#d8e0ea] bg-white px-2 py-0.5 text-[10px] font-bold tracking-normal text-[#7a8796]">
          {getSortLabel(field, sortField, sortDirection)}
        </span>
      </button>
    </th>
  );
}

function EmptyResults({ hasResults, hasActiveFilter }: { hasResults: boolean; hasActiveFilter: boolean }) {
  return (
    <div className="flex min-h-[430px] flex-col items-center justify-center px-6 text-center">
      <div className="rounded-lg border border-dashed border-[#9fb1c5] bg-[#f8fbff] px-5 py-3 font-mono text-lg font-black tracking-[0.12em] text-[#0a56a3]">
        GOLDN8
      </div>
      <h3 className="mt-5 text-lg font-bold text-[#101828]">
        {hasResults ? "No results match these controls" : "Ready for the first check"}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#667587]">
        {hasResults && hasActiveFilter
          ? "Clear the search or switch status filters to bring hidden plate checks back into view."
          : "Paste plate ideas or generate new ones, then start a run to see DMV availability results here."}
      </p>
    </div>
  );
}

function ResultsTable({
  results,
  sortField,
  sortDirection,
  onSort,
}: {
  results: PlateResult[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  return (
    <table className="w-full min-w-[780px]">
      <thead className="sticky top-0 z-10 border-b border-[#d8e0ea] bg-[#f7f9fc]">
        <tr>
          <SortableHeader field="plate" label="Plate" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <SortableHeader field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <SortableHeader field="timestamp" label="Time checked" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <th className="px-5 py-3 text-left text-xs font-black tracking-[0.12em] text-[#526172] uppercase">Run note</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#edf1f5]">
        {results.map((item) => (
          <tr key={item.plate} className={`border-l-4 ${statusStyles[item.status].rowClassName} transition hover:bg-[#f8fbff]`}>
            <td className="px-5 py-4 whitespace-nowrap">
              <MiniPlate plate={item.plate} />
            </td>
            <td className="px-5 py-4 whitespace-nowrap">
              <StatusBadge status={item.status} />
            </td>
            <td className="px-5 py-4 text-sm font-semibold whitespace-nowrap text-[#526172]">{item.timestamp.toLocaleTimeString()}</td>
            <td className="px-5 py-4 text-sm text-[#667587]">{item.error || "Ready"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResultsCards({ results }: { results: PlateResult[] }) {
  return (
    <div className="space-y-3 p-4 md:hidden">
      {results.map((item) => (
        <article
          key={item.plate}
          className={`rounded-lg border border-l-4 border-[#d8e0ea] bg-white p-4 ${statusStyles[item.status].rowClassName}`}
        >
          <div className="flex items-start justify-between gap-3">
            <MiniPlate plate={item.plate} />
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 text-sm text-[#526172]">
            <span className="font-semibold">Checked {item.timestamp.toLocaleTimeString()}</span>
            <span className="text-right">{item.error || "Ready"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generationRequest, setGenerationRequest] = useState<{ prompt: string; requestId: number } | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgressState | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [plates, setPlates] = useState<string[]>([]);
  const [results, setResults] = useState<PlateResult[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [resultQuery, setResultQuery] = useState("");
  const activePlatesRef = useRef<string[]>([]);
  const queuedPlatesRef = useRef<string[]>([]);
  const knownPlateSetRef = useRef<Set<string>>(new Set());

  const parsedPlates = useMemo(() => parsePlateCandidates(inputText), [inputText]);

  const result = api.plateChecker.checkPlates.useSubscription(plates.length ? { plates } : skipToken, {
    onData: (trackedData) => {
      const data = trackedData.data;
      setResults((prev) => {
        const existingIndex = prev.findIndex((r) => r.plate === data.plate && data.plate !== "SYSTEM");
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = data;
          return updated;
        }
        return [...prev, data];
      });
    },
    onError: (err) => {
      console.error("Subscription error:", err);
    },
  });

  api.plateGenerator.generateStream.useSubscription(generationRequest ?? skipToken, {
    onData: (trackedData) => {
      const event = trackedData.data;

      if (event.type === "progress") {
        setGenerationProgress({
          message: event.message,
          generatedCount: event.generatedCount,
          targetCount: event.targetCount,
          updatedAt: new Date(),
        });
        return;
      }

      if (event.type === "plate") {
        setGenerationProgress({
          message: "Plate ideas are coming in.",
          generatedCount: event.generatedCount,
          targetCount: event.targetCount,
          updatedAt: new Date(),
        });
        queuePlateCandidates([event.plate]);
        return;
      }

      setGenerationProgress({
        message: "Ideas are ready. Checking availability.",
        generatedCount: event.plates.length,
        targetCount: event.targetCount,
        updatedAt: new Date(),
      });
      queuePlateCandidates(event.plates);
      setGenerationRequest(null);
    },
    onError: (err) => {
      console.error("Generation error:", err);
      setGenerationError("We couldn't generate ideas right now. Please try again in a moment.");
      setGenerationProgress((currentProgress) =>
        currentProgress
          ? {
              ...currentProgress,
              message: "Idea generation stopped before finishing.",
              updatedAt: new Date(),
            }
          : null,
      );
      setGenerationRequest(null);
    },
  });

  const { plateResults, systemMessages } = useMemo(
    () => ({
      plateResults: results.filter((r) => r.plate !== "SYSTEM"),
      systemMessages: results.filter((r) => r.plate === "SYSTEM"),
    }),
    [results],
  );

  useEffect(() => {
    knownPlateSetRef.current = new Set(plateResults.map((plateResult) => plateResult.plate));
  }, [plateResults]);

  const activeBatchComplete = useMemo(() => {
    if (plates.length === 0) {
      return false;
    }

    return plates.every((plate) => {
      const plateResult = plateResults.find((resultItem) => resultItem.plate === plate);
      return plateResult && plateResult.status !== "CHECKING";
    });
  }, [plateResults, plates]);

  useEffect(() => {
    if (!activeBatchComplete) {
      return;
    }

    const nextBatch = queuedPlatesRef.current;
    if (nextBatch.length > 0) {
      queuedPlatesRef.current = [];
      activePlatesRef.current = nextBatch;
      setPlates(nextBatch);
      return;
    }

    activePlatesRef.current = [];
    setPlates([]);
  }, [activeBatchComplete]);

  const isChecking = result.status === "pending" || result.status === "connecting";
  const isGenerating = generationRequest !== null;

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(formatPlateForDisplay(e.target.value));
  };

  const normalizeInputList = () => {
    setInputText(formatPlateListForInput(parsedPlates));
  };

  function queuePlateCandidates(candidates: Iterable<string>) {
    const normalizedCandidates = uniquePlateCandidates(candidates);
    if (normalizedCandidates.length === 0) {
      return;
    }

    setInputText((currentInput) =>
      formatPlateListForInput(uniquePlateCandidates([...parsePlateCandidates(currentInput), ...normalizedCandidates])),
    );

    const platesToCheck = normalizedCandidates.filter((plate) => !knownPlateSetRef.current.has(plate));
    if (platesToCheck.length === 0) {
      return;
    }

    const queuedAt = new Date();
    for (const plate of platesToCheck) {
      knownPlateSetRef.current.add(plate);
    }

    setResults((currentResults) => [
      ...currentResults,
      ...platesToCheck.map((plate) => ({
        plate,
        status: "CHECKING" as const,
        timestamp: queuedAt,
        error: "Queued",
      })),
    ]);

    if (activePlatesRef.current.length === 0) {
      activePlatesRef.current = platesToCheck;
      setPlates(platesToCheck);
      return;
    }

    const nextQueuedPlates = uniquePlateCandidates([...queuedPlatesRef.current, ...platesToCheck]);
    queuedPlatesRef.current = nextQueuedPlates;
  }

  const handleCheckPlates = () => {
    if (parsedPlates.length === 0) {
      alert("Please enter at least one plate idea.");
      return;
    }

    queuePlateCandidates(parsedPlates);
  };

  const handleGeneratePlates = () => {
    const prompt = generationPrompt.trim();

    if (prompt.length < 3) {
      setGenerationError("Enter a prompt with at least 3 characters.");
      return;
    }

    setGenerationError("");
    setGenerationProgress({
      message: "Starting your plate ideas...",
      generatedCount: 0,
      updatedAt: new Date(),
    });
    setGenerationRequest({
      prompt,
      requestId: Date.now(),
    });
  };

  const handleStop = () => {
    result.reset();
    activePlatesRef.current = [];
    queuedPlatesRef.current = [];
    setPlates([]);
    setResults((currentResults) =>
      currentResults.map((item) =>
        item.status === "CHECKING" ? { ...item, status: "ERROR", error: "Stopped before completion.", timestamp: new Date() } : item,
      ),
    );
  };

  const handleClear = () => {
    activePlatesRef.current = [];
    queuedPlatesRef.current = [];
    knownPlateSetRef.current = new Set();
    setInputText("");
    setPlates([]);
    setResults([]);
    setGenerationProgress(null);
    setGenerationError("");
    setGenerationRequest(null);
    setFilter("all");
    setResultQuery("");
  };

  const counts = useMemo(
    () => ({
      available: plateResults.filter((r) => r.status === "AVAILABLE").length,
      unavailable: plateResults.filter((r) => r.status === "UNAVAILABLE").length,
      invalid: plateResults.filter((r) => r.status === "INVALID").length,
      error: plateResults.filter((r) => r.status === "ERROR").length,
      checking: plateResults.filter((r) => r.status === "CHECKING").length,
      totalChecked: plateResults.filter((r) => r.status !== "CHECKING").length,
    }),
    [plateResults],
  );

  const filteredAndSortedResults = useMemo(() => {
    const query = resultQuery.trim().toLowerCase();
    const filtered = plateResults.filter((r) => {
      const matchesStatus =
        filter === "all" ||
        (filter === "available" && r.status === "AVAILABLE") ||
        (filter === "unavailable" && r.status === "UNAVAILABLE") ||
        (filter === "checking" && r.status === "CHECKING") ||
        (filter === "invalid" && r.status === "INVALID") ||
        (filter === "error" && r.status === "ERROR");

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        formatPlateForDisplay(r.plate).toLowerCase().includes(query) ||
        r.status.toLowerCase().includes(query) ||
        (r.error ?? "").toLowerCase().includes(query)
      );
    });

    return sortPlateResults(filtered, sortField, sortDirection);
  }, [plateResults, filter, resultQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const downloadCSV = () => {
    const csvContent = [
      ["Plate", "Status", "Timestamp", "Error"].join(","),
      ...filteredAndSortedResults.map((r) =>
        [formatPlateForDisplay(r.plate), r.status, r.timestamp.toISOString(), r.error || ""].map((field) => `"${field}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `plate-check-results-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveChecks = counts.checking > 0 || isChecking;
  const totalTargets = plateResults.length;
  const completionPercent = totalTargets ? Math.min(100, Math.round((counts.totalChecked / totalTargets) * 100)) : 0;
  const previewPlate = parsedPlates[0] ?? "SUNSET";
  const hasActiveResultControls = filter !== "all" || resultQuery.trim().length > 0;
  const generationProgressCount = generationProgress?.generatedCount ?? 0;
  const generationProgressTarget = generationProgress?.targetCount;
  const generationProgressPercent = generationProgressTarget
    ? Math.min(100, Math.round((generationProgressCount / generationProgressTarget) * 100))
    : isGenerating
      ? 12
      : generationProgress
        ? 100
        : 0;
  const generationProgressBarWidth = isGenerating ? Math.max(12, generationProgressPercent) : generationProgressPercent;
  const generationProgressCountLabel = generationProgressTarget
    ? `${generationProgressCount} of ${generationProgressTarget} ideas`
    : `${generationProgressCount} ideas found`;
  const filterOptions: FilterOption[] = [
    {
      id: "all",
      label: "All",
      count: plateResults.length,
      activeClassName: "border-[#0a56a3] bg-[#0a56a3] text-white",
    },
    {
      id: "available",
      label: "Available",
      count: counts.available,
      activeClassName: "border-[#2f9e53] bg-[#2f9e53] text-white",
    },
    {
      id: "unavailable",
      label: "Unavailable",
      count: counts.unavailable,
      activeClassName: "border-[#d6453d] bg-[#d6453d] text-white",
    },
    {
      id: "checking",
      label: "Checking",
      count: counts.checking,
      activeClassName: "border-[#0a56a3] bg-[#e8f3ff] text-[#0a56a3]",
    },
    {
      id: "invalid",
      label: "Invalid",
      count: counts.invalid,
      activeClassName: "border-[#b9810a] bg-[#fff1c4] text-[#6a4a00]",
    },
    {
      id: "error",
      label: "Errors",
      count: counts.error,
      activeClassName: "border-[#b9810a] bg-[#fff1c4] text-[#6a4a00]",
    },
  ];
  const visibleFilterOptions = filterOptions.filter((option) => option.count !== 0 || option.id === "all");

  const stats: StatItem[] = [
    { label: "Checked", value: counts.totalChecked, className: "text-[#0a56a3]" },
    { label: "In progress", value: counts.checking, className: "text-[#0a56a3]" },
    { label: "Available", value: counts.available, className: "text-[#12642d]" },
    { label: "Unavailable", value: counts.unavailable, className: "text-[#9d241c]" },
    { label: "Invalid", value: counts.invalid, className: "text-[#785300]" },
    { label: "Errors", value: counts.error, className: "text-[#765100]" },
  ];

  return (
    <>
      <Head>
        <title>CA DMV Plate Finder</title>
        <meta name="description" content="Check California DMV plate availability" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#f3f4f1" />
      </Head>
      <main className="min-h-screen text-[#172033]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-5 sm:px-6 lg:px-8">
          <div className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
            <section className="space-y-5" aria-label="Plate input and run summary">
              <div className="surface-card rounded-[24px] p-5 sm:p-6">
                <PanelHeader
                  kicker="Step 1"
                  title="Generate plate ideas"
                  description="Describe a theme and we will add valid plate ideas to availability checks."
                  action={<MiniPlate plate={previewPlate} />}
                />

                <label htmlFor="plate-generation-prompt" className="mt-5 block text-sm font-bold text-[#344054]">
                  Describe your idea
                </label>
                <textarea
                  id="plate-generation-prompt"
                  value={generationPrompt}
                  onChange={(event) => setGenerationPrompt(event.target.value)}
                  placeholder="Short beach-themed plates for a vintage Porsche"
                  className="mt-2 min-h-28 w-full resize-y rounded-lg border border-[#c8d2df] bg-[#fbfcfe] p-4 text-sm text-[#172033] shadow-inner transition placeholder:text-[#98a4b3] focus:border-[#0a56a3] focus:ring-4 focus:ring-[#0a56a3]/10 focus:outline-none disabled:cursor-not-allowed disabled:bg-[#eef2f6] disabled:text-[#7a8796]"
                  disabled={isGenerating}
                />

                <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Idea starters">
                  <span className="mr-1 text-xs font-bold tracking-[0.12em] text-[#667587] uppercase">Try</span>
                  {promptStarters.map((starter) => (
                    <button
                      key={starter.label}
                      type="button"
                      onClick={() => {
                        setGenerationPrompt(starter.prompt);
                        setGenerationError("");
                      }}
                      disabled={isGenerating}
                      className="rounded-full border border-[#d8e0ea] bg-[#f8fbff] px-3 py-1.5 text-xs font-bold text-[#0a56a3] transition hover:border-[#0a56a3] hover:bg-[#edf5ff] focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {starter.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleGeneratePlates}
                  disabled={isGenerating || generationPrompt.trim().length < 3}
                  className="mt-4 w-full rounded-xl border border-[#0a56a3] bg-[#0a56a3] px-4 py-3 text-sm font-black text-white shadow-[0_8px_18px_rgba(10,86,163,0.2)] transition hover:bg-[#084987] focus-visible:ring-4 focus-visible:ring-[#0a56a3]/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-[#c8d2df] disabled:bg-[#d5dce5] disabled:text-[#7b8795] disabled:shadow-none"
                >
                  {isGenerating ? "Generating..." : "Generate and check ideas"}
                </button>

                {(isGenerating || generationProgress) && (
                  <output className="mt-3 block rounded-lg border border-[#8abde8] bg-[#e8f3ff] p-3" aria-live="polite">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[#0a56a3]">{generationProgress?.message ?? "Starting your plate ideas..."}</p>
                        <p className="mt-1 text-xs font-semibold text-[#526172]">
                          Availability checks start automatically as ideas appear.
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#0a56a3] tabular-nums">
                        {generationProgressCountLabel}
                      </span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                      <div
                        className={`h-full rounded-full bg-[#0a56a3] transition-all duration-300 ${isGenerating ? "animate-pulse" : ""}`}
                        style={{ width: `${generationProgressBarWidth}%` }}
                      />
                    </div>
                  </output>
                )}

                {generationError && (
                  <div className="mt-3 rounded-lg border border-[#f1ca6d] bg-[#fff4d6] px-3 py-2 text-sm font-semibold text-[#765100]">
                    {generationError}
                  </div>
                )}

                <details className="group mt-5 rounded-xl border border-[#d8e0ea] bg-[#f8fbff]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-left marker:hidden focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="block text-sm font-black text-[#101828]">Manual plate ideas</span>
                      <span className="mt-0.5 block text-xs font-semibold text-[#667587]">
                        Paste a manual list when you already know what to check.
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#526172]">
                        {parsedPlates.length} detected
                      </span>
                      <span className="text-lg font-black text-[#0a56a3] group-open:hidden" aria-hidden="true">
                        +
                      </span>
                      <span className="hidden text-lg font-black text-[#0a56a3] group-open:block" aria-hidden="true">
                        -
                      </span>
                    </span>
                  </summary>

                  <div className="border-t border-[#d8e0ea] px-4 pt-4 pb-4">
                    <label htmlFor="plate-input" className="block text-sm font-bold text-[#344054]">
                      Plate ideas
                    </label>
                    <textarea
                      id="plate-input"
                      value={inputText}
                      onChange={handleInputChange}
                      onBlur={normalizeInputList}
                      placeholder={"SUNSET\nTESLA 1\nSURF/1\nEVRIDE\nGOLDN8"}
                      className="mt-2 min-h-48 w-full resize-y rounded-lg border border-[#c8d2df] bg-white p-4 font-mono text-sm text-[#172033] shadow-inner transition placeholder:text-[#98a4b3] focus:border-[#0a56a3] focus:ring-4 focus:ring-[#0a56a3]/10 focus:outline-none disabled:cursor-not-allowed disabled:bg-[#eef2f6] disabled:text-[#7a8796]"
                      disabled={hasActiveChecks}
                    />

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[#526172]">
                      <span>
                        <strong className="font-black text-[#101828]">{parsedPlates.length}</strong> ideas detected
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">2-7 characters</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#667587]">
                      Use letters, digits 1-9, spaces for full spaces, and / for half-spaces.
                    </p>

                    {!hasActiveChecks && (
                      <button
                        type="button"
                        onClick={handleCheckPlates}
                        disabled={parsedPlates.length === 0}
                        className="mt-4 w-full rounded-lg bg-[#ffd84d] px-5 py-3 text-sm font-black text-[#152238] transition hover:bg-[#f4c935] focus-visible:ring-4 focus-visible:ring-[#ffd84d]/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-[#d5dce5] disabled:text-[#7b8795]"
                      >
                        Check manual list
                      </button>
                    )}
                  </div>
                </details>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  {hasActiveChecks ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="flex-1 rounded-lg bg-[#d6453d] px-5 py-3 text-sm font-black text-white transition hover:bg-[#bf332c] focus-visible:ring-4 focus-visible:ring-[#d6453d]/20 focus-visible:outline-none"
                    >
                      Stop checking
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="flex-1 rounded-lg border border-[#c8d2df] bg-white px-5 py-3 text-sm font-bold text-[#344054] transition hover:border-[#98a4b3] hover:bg-[#f7f9fc] focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="surface-card rounded-[24px] p-5 sm:p-6">
                <PanelHeader kicker="Step 2" title="Run progress" description="Track completion and keep the outcome mix visible." />
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-bold text-[#526172]">
                    <span>{totalTargets > 0 ? "Queued checks" : "No queued checks"}</span>
                    <span className="tabular-nums">
                      {counts.totalChecked} / {totalTargets}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e4ebf3]">
                    <div
                      className="h-full rounded-full bg-[#0a56a3] transition-all duration-300"
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {stats.map((stat) => (
                    <StatCard key={stat.label} stat={stat} />
                  ))}
                </div>
              </div>

              {systemMessages.length > 0 && (
                <div className="surface-card rounded-[24px] p-4">
                  <h3 className="text-sm font-bold text-[#344054]">System status</h3>
                  <div className="mt-3 space-y-2 text-sm text-[#667587]">
                    {systemMessages.slice(-3).map((msg) => (
                      <div key={`${msg.timestamp.toISOString()}-${msg.error ?? "system"}`} className="border-l-2 border-[#ffd84d] pl-3">
                        {msg.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="surface-card min-w-0 overflow-hidden rounded-[24px]" aria-label="Plate availability results">
              <div className="border-b border-[#e1e7ef] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <PanelHeader
                    kicker="Step 3"
                    title="Availability results"
                    description={`Showing ${filteredAndSortedResults.length} of ${plateResults.length} plate checks.`}
                  />

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <label htmlFor="result-search" className="sr-only">
                      Search results
                    </label>
                    <input
                      id="result-search"
                      value={resultQuery}
                      onChange={(event) => setResultQuery(event.target.value)}
                      placeholder="Search plate, status, note"
                      className="h-10 min-w-0 rounded-lg border border-[#c8d2df] bg-[#fbfcfe] px-3 text-sm font-semibold text-[#172033] transition placeholder:text-[#98a4b3] focus:border-[#0a56a3] focus:ring-4 focus:ring-[#0a56a3]/10 focus:outline-none sm:min-w-64"
                    />
                    {filteredAndSortedResults.length > 0 && (
                      <button
                        type="button"
                        onClick={downloadCSV}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-[#c8d2df] bg-[#f7f9fc] px-4 text-sm font-bold text-[#344054] transition hover:border-[#98a4b3] hover:bg-white focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none"
                      >
                        Export CSV
                      </button>
                    )}
                  </div>
                </div>

                {visibleFilterOptions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {visibleFilterOptions.map((option) => (
                      <FilterButton key={option.id} option={option} isActive={filter === option.id} onClick={() => setFilter(option.id)} />
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[#f2f4f7]">
                <div className="max-h-[calc(100vh-260px)] min-h-[500px] overflow-auto">
                  {filteredAndSortedResults.length === 0 ? (
                    <EmptyResults hasResults={plateResults.length > 0} hasActiveFilter={hasActiveResultControls} />
                  ) : (
                    <>
                      <div className="hidden md:block">
                        <ResultsTable
                          results={filteredAndSortedResults}
                          sortField={sortField}
                          sortDirection={sortDirection}
                          onSort={handleSort}
                        />
                      </div>
                      <ResultsCards results={filteredAndSortedResults} />
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
