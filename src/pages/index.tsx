import { skipToken } from "@tanstack/react-query";
import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  sortPlateResults,
  type PlateResultSortDirection as SortDirection,
  type PlateResultSortField as SortField,
  type PlateResultStatus,
} from "~/plateResultSorting";
import { formatPlateForDisplay, parsePlateCandidates } from "~/plateRules";
import { api } from "~/utils/api";

interface PlateResult {
  plate: string;
  status: PlateResultStatus;
  timestamp: Date;
  error?: string;
  totalChecked?: number;
}

type FilterType = "all" | "available" | "unavailable" | "checking" | "invalid" | "error";
type GeneratedPlateApplyMode = "append" | "replace";

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

const getStatusColor = (status: PlateResult["status"]) => {
  switch (status) {
    case "AVAILABLE":
      return "border-[#8bd8a5] bg-[#e9f9ee] text-[#12642d]";
    case "UNAVAILABLE":
      return "border-[#f5aaa5] bg-[#fff0ef] text-[#9d241c]";
    case "INVALID":
      return "border-[#f0c36a] bg-[#fff7df] text-[#785300]";
    case "ERROR":
      return "border-[#f1ca6d] bg-[#fff4d6] text-[#765100]";
    case "CHECKING":
      return "border-[#90bee8] bg-[#e8f3ff] text-[#0a56a3]";
  }
};

const getSortLabel = (field: SortField, sortField: SortField, sortDirection: SortDirection) => {
  return sortField === field ? sortDirection : "sort";
};

const formatPlateListForInput = (plateList: string[]) => plateList.map(formatPlateForDisplay).join("\n");

function StatCard({ stat }: { stat: StatItem }) {
  return (
    <div className="rounded-lg border border-[#d8e0ea] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-[0.12em] text-[#6a7787] uppercase">{stat.label}</p>
      <p className={`mt-2 text-3xl font-bold ${stat.className}`}>{stat.value}</p>
    </div>
  );
}

function FilterButton({ option, isActive, onClick }: { option: FilterOption; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none ${
        isActive ? option.activeClassName : "border-[#d8e0ea] bg-white text-[#526172] hover:border-[#aab6c4] hover:text-[#172033]"
      }`}
    >
      {option.label} ({option.count})
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
        className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-[#526172] uppercase transition hover:text-[#0a56a3]"
        onClick={() => onSort(field)}
      >
        {label}
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[#7a8796]">
          {getSortLabel(field, sortField, sortDirection)}
        </span>
      </button>
    </th>
  );
}

function StatusBadge({ status }: { status: PlateResult["status"] }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getStatusColor(status)}`}>{status}</span>;
}

function EmptyResults({ hasResults }: { hasResults: boolean }) {
  return (
    <div className="flex min-h-[440px] flex-col items-center justify-center px-6 text-center">
      <div className="rounded-lg border border-dashed border-[#b8c8d9] bg-[#f8fbff] px-5 py-3 font-mono text-lg font-bold text-[#0a56a3]">
        ABC123
      </div>
      <h3 className="mt-5 text-lg font-semibold text-[#101828]">{hasResults ? "No results match this filter" : "No checks yet"}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#667587]">
        {hasResults
          ? "Try a different status filter or download the currently visible results."
          : "Paste plate candidates on the left and start a check to stream availability results here."}
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
    <table className="w-full min-w-[760px]">
      <thead className="sticky top-0 z-10 border-b border-[#d8e0ea] bg-[#f7f9fc]">
        <tr>
          <SortableHeader field="plate" label="Plate" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <SortableHeader field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <SortableHeader field="timestamp" label="Time checked" sortField={sortField} sortDirection={sortDirection} onSort={onSort} />
          <th className="px-5 py-3 text-left text-xs font-bold tracking-[0.12em] text-[#526172] uppercase">Error</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#edf1f5]">
        {results.map((item) => (
          <tr key={item.plate} className="transition hover:bg-[#f8fbff]">
            <td className="px-5 py-4 whitespace-nowrap">
              <span className="rounded border border-[#d8e0ea] bg-[#fbfcfe] px-3 py-1 font-mono text-sm font-bold tracking-[0.08em] whitespace-pre text-[#101828]">
                {formatPlateForDisplay(item.plate)}
              </span>
            </td>
            <td className="px-5 py-4 whitespace-nowrap">
              <StatusBadge status={item.status} />
            </td>
            <td className="px-5 py-4 text-sm font-medium whitespace-nowrap text-[#526172]">{item.timestamp.toLocaleTimeString()}</td>
            <td className="px-5 py-4 text-sm text-[#667587]">{item.error || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [generatedPlates, setGeneratedPlates] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState("");
  const [plates, setPlates] = useState<string[]>([]);
  const [results, setResults] = useState<PlateResult[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const resultsEndRef = useRef<HTMLDivElement>(null);

  const parsedPlates = useMemo(() => parsePlateCandidates(inputText), [inputText]);

  const generatePlates = api.plateGenerator.generate.useMutation({
    onMutate: () => {
      setGenerationError("");
      setGeneratedPlates([]);
    },
    onSuccess: (data) => {
      setGeneratedPlates(data.plates);
    },
    onError: (err) => {
      setGenerationError(err.message);
    },
  });

  useEffect(() => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [results]);

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

  const isChecking = result.status === "pending" || result.status === "connecting";
  const isGenerating = generatePlates.status === "pending";
  const rejectedGenerationCount = generatePlates.data?.rejected.length ?? 0;
  const generatedModel = generatePlates.data?.model ?? "gpt-5.5";

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(formatPlateForDisplay(e.target.value));
  };

  const normalizeInputList = () => {
    setInputText(formatPlateListForInput(parsedPlates));
  };

  const handleCheckPlates = () => {
    if (parsedPlates.length === 0) {
      alert("Please enter at least one plate candidate");
      return;
    }

    setInputText(formatPlateListForInput(parsedPlates));
    setPlates(parsedPlates);
    setResults([]);
    setFilter("all");
  };

  const handleGeneratePlates = () => {
    const prompt = generationPrompt.trim();

    if (prompt.length < 3) {
      setGenerationError("Enter a prompt with at least 3 characters.");
      return;
    }

    generatePlates.mutate({
      prompt,
    });
  };

  const applyGeneratedPlates = (mode: GeneratedPlateApplyMode) => {
    const basePlates = mode === "append" ? parsedPlates : [];
    const nextPlates = parsePlateCandidates([...basePlates, ...generatedPlates].join("\n"));
    setInputText(formatPlateListForInput(nextPlates));
  };

  const handleStop = () => {
    result.reset();
    setPlates([]);
  };

  const handleClear = () => {
    setInputText("");
    setPlates([]);
    setResults([]);
    setGeneratedPlates([]);
    setGenerationError("");
    setFilter("all");
  };

  const { plateResults, systemMessages } = useMemo(
    () => ({
      plateResults: results.filter((r) => r.plate !== "SYSTEM"),
      systemMessages: results.filter((r) => r.plate === "SYSTEM"),
    }),
    [results],
  );

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
    const filtered = plateResults.filter((r) => {
      switch (filter) {
        case "available":
          return r.status === "AVAILABLE";
        case "unavailable":
          return r.status === "UNAVAILABLE";
        case "checking":
          return r.status === "CHECKING";
        case "invalid":
          return r.status === "INVALID";
        case "error":
          return r.status === "ERROR";
        default:
          return true;
      }
    });

    return sortPlateResults(filtered, sortField, sortDirection);
  }, [plateResults, filter, sortField, sortDirection]);

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

  const totalTargets = plates.length || plateResults.length;
  const completionPercent = totalTargets ? Math.min(100, Math.round((counts.totalChecked / totalTargets) * 100)) : 0;
  const runStatus = isChecking ? "Checking now" : plateResults.length ? "Results ready" : "Ready";

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
  const visibleFilterOptions = filterOptions.filter((option) => option.count !== 0);

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
        <meta name="theme-color" content="#eef3f8" />
      </Head>
      <main className="min-h-screen bg-[#eef3f8] text-[#172033]">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 border-b border-[#d8e0ea] pb-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold tracking-[0.18em] text-[#0a56a3] uppercase">California DMV availability search</p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#101828] sm:text-5xl">CA DMV Plate Finder</h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[#526172]">
                  Paste plate candidates, stream availability checks, and keep the promising hits visible while the scan runs.
                </p>
              </div>

              <a
                href="https://blog.jonlu.ca/posts/ca-plate-checker"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center rounded-full border border-[#b8c8d9] bg-white px-4 py-2 text-sm font-semibold text-[#0a56a3] shadow-sm transition hover:border-[#0a56a3] hover:bg-[#f8fbff] focus-visible:ring-4 focus-visible:ring-[#0a56a3]/15 focus-visible:outline-none"
              >
                How it works{" "}
                <span className="ml-2" aria-hidden="true">
                  -&gt;
                </span>
              </a>
            </div>
          </header>

          <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <section className="space-y-4" aria-label="Plate input and run summary">
              <div className="rounded-lg border border-[#d8e0ea] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.14em] text-[#6a7787] uppercase">Input</p>
                    <h2 className="mt-1 text-xl font-semibold text-[#101828]">Plate candidates</h2>
                  </div>
                  <span className="rounded-full border border-[#d8e0ea] bg-[#f7f9fc] px-3 py-1 text-xs font-semibold text-[#526172]">
                    {runStatus}
                  </span>
                </div>

                <label htmlFor="plate-input" className="mt-5 block text-sm font-medium text-[#344054]">
                  Paste one or many plate ideas
                </label>
                <textarea
                  id="plate-input"
                  value={inputText}
                  onChange={handleInputChange}
                  onBlur={normalizeInputList}
                  placeholder={"ABC123\nXYZ789\nPLATE1"}
                  className="mt-2 min-h-44 w-full resize-y rounded-lg border border-[#c8d2df] bg-[#fbfcfe] p-4 font-mono text-sm text-[#172033] shadow-inner transition placeholder:text-[#98a4b3] focus:border-[#0a56a3] focus:ring-4 focus:ring-[#0a56a3]/10 focus:outline-none disabled:cursor-not-allowed disabled:bg-[#eef2f6] disabled:text-[#7a8796]"
                  disabled={isChecking}
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[#526172]">
                  <span>
                    Detected <strong className="font-semibold text-[#101828]">{parsedPlates.length}</strong> candidates
                  </span>
                  <span>2-7 characters</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#667587]">
                  Use letters, digits 1-9, spaces for full spaces, and / for half-spaces.
                </p>

                <div className="mt-5 border-t border-[#e1e7ef] pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.14em] text-[#6a7787] uppercase">GPT-5 generator</p>
                      <h3 className="mt-1 text-base font-semibold text-[#101828]">Generate plate ideas</h3>
                    </div>
                  </div>

                  <label htmlFor="plate-generation-prompt" className="mt-4 block text-sm font-medium text-[#344054]">
                    Prompt
                  </label>
                  <textarea
                    id="plate-generation-prompt"
                    value={generationPrompt}
                    onChange={(event) => setGenerationPrompt(event.target.value)}
                    placeholder="Short beach-themed plates for a vintage Porsche"
                    className="mt-2 min-h-24 w-full resize-y rounded-lg border border-[#c8d2df] bg-[#fbfcfe] p-3 text-sm text-[#172033] shadow-inner transition placeholder:text-[#98a4b3] focus:border-[#0a56a3] focus:ring-4 focus:ring-[#0a56a3]/10 focus:outline-none disabled:cursor-not-allowed disabled:bg-[#eef2f6] disabled:text-[#7a8796]"
                    disabled={isChecking || isGenerating}
                  />

                  <button
                    type="button"
                    onClick={handleGeneratePlates}
                    disabled={isChecking || isGenerating || generationPrompt.trim().length < 3}
                    className="mt-3 w-full rounded-lg border border-[#0a56a3] bg-[#0a56a3] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#084987] focus-visible:ring-4 focus-visible:ring-[#0a56a3]/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-[#c8d2df] disabled:bg-[#d5dce5] disabled:text-[#7b8795]"
                  >
                    {isGenerating ? "Generating..." : "Generate ideas"}
                  </button>

                  {generationError && (
                    <div className="mt-3 rounded-lg border border-[#f1ca6d] bg-[#fff4d6] px-3 py-2 text-sm text-[#765100]">
                      {generationError}
                    </div>
                  )}

                  {generatedPlates.length > 0 && (
                    <div className="mt-4 rounded-lg border border-[#d8e0ea] bg-[#f8fbff] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#526172]">
                        <span>
                          {generatedPlates.length} generated with {generatedModel}
                        </span>
                        {rejectedGenerationCount > 0 && <span>{rejectedGenerationCount} filtered out</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {generatedPlates.map((plate) => (
                          <span
                            key={plate}
                            className="rounded border border-[#b8c8d9] bg-white px-2.5 py-1 font-mono text-xs font-bold tracking-[0.08em] whitespace-pre text-[#101828]"
                          >
                            {formatPlateForDisplay(plate)}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => applyGeneratedPlates("append")}
                          disabled={isChecking}
                          className="rounded-lg border border-[#c8d2df] bg-white px-3 py-2 text-xs font-semibold text-[#344054] transition hover:border-[#98a4b3] hover:bg-[#f7f9fc] focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-[#eef2f6]"
                        >
                          Append
                        </button>
                        <button
                          type="button"
                          onClick={() => applyGeneratedPlates("replace")}
                          disabled={isChecking}
                          className="rounded-lg border border-[#c8d2df] bg-white px-3 py-2 text-xs font-semibold text-[#344054] transition hover:border-[#98a4b3] hover:bg-[#f7f9fc] focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-[#eef2f6]"
                        >
                          Replace
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  {!isChecking ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCheckPlates}
                        disabled={parsedPlates.length === 0}
                        className="flex-1 rounded-lg bg-[#ffd84d] px-5 py-3 text-sm font-bold text-[#152238] shadow-sm transition hover:bg-[#f4c935] focus-visible:ring-4 focus-visible:ring-[#ffd84d]/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-[#d5dce5] disabled:text-[#7b8795]"
                      >
                        Check plates
                      </button>
                      <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-lg border border-[#c8d2df] bg-white px-5 py-3 text-sm font-semibold text-[#344054] transition hover:border-[#98a4b3] hover:bg-[#f7f9fc] focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none"
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="flex-1 rounded-lg bg-[#d6453d] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#bf332c] focus-visible:ring-4 focus-visible:ring-[#d6453d]/20 focus-visible:outline-none"
                    >
                      Stop checking
                    </button>
                  )}
                </div>

                {totalTargets > 0 && (
                  <div className="mt-5 border-t border-[#e1e7ef] pt-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#526172]">
                      <span>Run progress</span>
                      <span>
                        {counts.totalChecked} / {totalTargets}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e4ebf3]">
                      <div
                        className="h-full rounded-full bg-[#0a56a3] transition-all duration-300"
                        style={{ width: `${completionPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {stats.map((stat) => (
                  <StatCard key={stat.label} stat={stat} />
                ))}
              </div>

              {systemMessages.length > 0 && (
                <div className="rounded-lg border border-[#d8e0ea] bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-[#344054]">System status</h3>
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

            <section className="min-w-0 rounded-lg border border-[#d8e0ea] bg-white shadow-sm" aria-label="Plate availability results">
              <div className="flex flex-col gap-4 border-b border-[#e1e7ef] p-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-[#6a7787] uppercase">Results</p>
                  <h2 className="mt-1 text-xl font-semibold text-[#101828]">Availability results</h2>
                  <p className="mt-1 text-sm text-[#667587]">
                    Showing {filteredAndSortedResults.length} of {plateResults.length} plate checks.
                  </p>
                </div>

                {filteredAndSortedResults.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadCSV}
                    className="inline-flex w-fit items-center justify-center rounded-lg border border-[#c8d2df] bg-[#f7f9fc] px-4 py-2 text-sm font-semibold text-[#344054] transition hover:border-[#98a4b3] hover:bg-white focus-visible:ring-4 focus-visible:ring-[#0a56a3]/10 focus-visible:outline-none"
                  >
                    Download CSV
                  </button>
                )}
              </div>

              {visibleFilterOptions.length > 0 && (
                <div className="flex flex-wrap gap-2 px-5 py-4">
                  {visibleFilterOptions.map((option) => (
                    <FilterButton key={option.id} option={option} isActive={filter === option.id} onClick={() => setFilter(option.id)} />
                  ))}
                </div>
              )}

              <div className="border-t border-[#e1e7ef]">
                <div className="max-h-[620px] min-h-[440px] overflow-auto">
                  {filteredAndSortedResults.length === 0 ? (
                    <EmptyResults hasResults={plateResults.length > 0} />
                  ) : (
                    <ResultsTable
                      results={filteredAndSortedResults}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  )}
                  <div ref={resultsEndRef} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
