import Head from "next/head";
import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "~/utils/api";
import { skipToken } from "@tanstack/react-query";
import { parsePlateCandidates } from "~/plateRules";

interface PlateResult {
  plate: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "INVALID" | "ERROR" | "CHECKING";
  timestamp: Date;
  error?: string;
  totalChecked?: number;
}

type FilterType = "all" | "available" | "unavailable" | "invalid" | "error";
type SortField = "plate" | "status" | "timestamp";
type SortDirection = "asc" | "desc";

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [plates, setPlates] = useState<string[]>([]);
  const [results, setResults] = useState<PlateResult[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const resultsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [results]);

  const result = api.plateChecker.checkPlates.useSubscription(plates.length ? { plates } : skipToken, {
    onData: (trackedData) => {
      const data = trackedData.data;
      setResults((prev) => {
        // Update existing plate if it exists, otherwise add new
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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const parsePlates = (text: string): string[] => {
    return parsePlateCandidates(text);
  };

  const handleCheckPlates = () => {
    const parsedPlates = parsePlates(inputText);
    if (parsedPlates.length === 0) {
      alert("Please enter at least one plate candidate");
      return;
    }

    setPlates(parsedPlates);
    setResults([]);
    setFilter("all");
  };

  const handleStop = () => {
    result.reset();
    setPlates([]);
  };

  const handleClear = () => {
    setInputText("");
    setPlates([]);
    setResults([]);
    setFilter("all");
  };

  const plateResults = results.filter((r) => r.plate !== "SYSTEM");
  const systemMessages = results.filter((r) => r.plate === "SYSTEM");

  const filteredAndSortedResults = useMemo(() => {
    const filtered = plateResults.filter((r) => {
      switch (filter) {
        case "available":
          return r.status === "AVAILABLE";
        case "unavailable":
          return r.status === "UNAVAILABLE";
        case "invalid":
          return r.status === "INVALID";
        case "error":
          return r.status === "ERROR";
        default:
          return true;
      }
    });

    return filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "plate":
          comparison = a.plate.localeCompare(b.plate);
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "timestamp":
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
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
        [r.plate, r.status, r.timestamp.toISOString(), r.error || ""].map((field) => `"${field}"`).join(","),
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

  const availableCount = plateResults.filter((r) => r.status === "AVAILABLE").length;
  const unavailableCount = plateResults.filter((r) => r.status === "UNAVAILABLE").length;
  const invalidCount = plateResults.filter((r) => r.status === "INVALID").length;
  const errorCount = plateResults.filter((r) => r.status === "ERROR").length;
  const checkingCount = plateResults.filter((r) => r.status === "CHECKING").length;
  const totalChecked = plateResults.filter((r) => r.status !== "CHECKING").length;

  const getStatusColor = (status: PlateResult["status"]) => {
    switch (status) {
      case "AVAILABLE":
        return "bg-green-500 text-white";
      case "UNAVAILABLE":
        return "bg-red-500 text-white";
      case "INVALID":
        return "bg-orange-500 text-black";
      case "ERROR":
        return "bg-yellow-500 text-black";
      case "CHECKING":
        return "bg-blue-500 text-white animate-pulse";
      default:
        return "bg-gray-500 text-white";
    }
  };

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
        <meta name="theme-color" content="#003d7a" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
        <div className="container mx-auto max-w-7xl px-4 py-8">
          <h1 className="mb-8 text-center text-4xl font-bold">
            California DMV <span className="text-blue-400">Plate Checker</span>
          </h1>

          <div className="mb-6 text-center">
            <a
              href="https://blog.jonlu.ca/posts/ca-plate-checker"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-blue-400 transition-colors hover:text-blue-300"
            >
              <span>📖</span>
              <span>Read the blog post about how this works</span>
              <span>→</span>
            </a>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-1">
              <div className="rounded-lg bg-gray-800 p-6">
                <h2 className="mb-4 text-xl font-semibold">Enter Plates to Check</h2>
                <textarea
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="Enter plates separated by spaces, commas, or new lines&#10;Example: ABC123 XYZ789 PLATE1"
                  className="h-40 w-full resize-none rounded-lg bg-gray-700 p-4 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={isChecking}
                />
                <div className="mt-4 text-sm text-gray-400">Detected plates: {parsePlates(inputText).length}</div>
                <p className="mt-2 text-xs text-gray-500">
                  California 1960s Legacy personalized plates use 2-7 characters. Use letters, digits 1-9, * for full spaces, and / for
                  half-spaces.
                </p>
              </div>

              <div className="flex gap-4">
                {!isChecking ? (
                  <>
                    <button
                      onClick={handleCheckPlates}
                      disabled={parsePlates(inputText).length === 0}
                      className="flex-1 rounded-lg bg-blue-600 px-6 py-3 font-semibold transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700"
                    >
                      Check Plates
                    </button>
                    <button
                      onClick={handleClear}
                      className="rounded-lg bg-gray-700 px-6 py-3 font-semibold transition-colors hover:bg-gray-600"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStop}
                    className="flex-1 rounded-lg bg-red-600 px-6 py-3 font-semibold transition-colors hover:bg-red-700"
                  >
                    Stop Checking
                  </button>
                )}
              </div>

              <div className="rounded-lg bg-gray-800 p-6">
                <h3 className="mb-4 text-lg font-semibold">Statistics</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total Checked:</span>
                    <span className="font-semibold">{totalChecked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">In Progress:</span>
                    <span className="font-semibold text-blue-400">{checkingCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Available:</span>
                    <span className="font-semibold text-green-400">{availableCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Unavailable:</span>
                    <span className="font-semibold text-red-400">{unavailableCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Errors:</span>
                    <span className="font-semibold text-red-400">{errorCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Invalid:</span>
                    <span className="font-semibold text-orange-400">{invalidCount}</span>
                  </div>
                </div>
              </div>

              {systemMessages.length > 0 && (
                <div className="rounded-lg bg-gray-800 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-gray-400">System Status</h3>
                  <div className="space-y-1 text-xs text-gray-500">
                    {systemMessages.slice(-3).map((msg) => (
                      <div key={`${msg.timestamp.toISOString()}-${msg.error ?? "system"}`}>→ {msg.error}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-lg bg-gray-800 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Results</h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilter("all")}
                      className={`rounded px-3 py-1 text-sm transition-colors ${
                        filter === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      All ({plateResults.length})
                    </button>
                    <button
                      onClick={() => setFilter("available")}
                      className={`rounded px-3 py-1 text-sm transition-colors ${
                        filter === "available" ? "bg-green-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      Available ({availableCount})
                    </button>
                    <button
                      onClick={() => setFilter("unavailable")}
                      className={`rounded px-3 py-1 text-sm transition-colors ${
                        filter === "unavailable" ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      Unavailable ({unavailableCount})
                    </button>
                    <button
                      onClick={() => setFilter("invalid")}
                      className={`rounded px-3 py-1 text-sm transition-colors ${
                        filter === "invalid" ? "bg-orange-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      Invalid ({invalidCount})
                    </button>
                    <button
                      onClick={() => setFilter("error")}
                      className={`rounded px-3 py-1 text-sm transition-colors ${
                        filter === "error" ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      Errors ({errorCount})
                    </button>
                    {filteredAndSortedResults.length > 0 && (
                      <button
                        onClick={downloadCSV}
                        className="rounded bg-gray-700 px-3 py-1 text-sm text-gray-300 transition-colors hover:bg-gray-600"
                      >
                        📥 Download CSV
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-[600px] overflow-auto rounded-lg bg-gray-900">
                  {filteredAndSortedResults.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      {plateResults.length === 0
                        ? "No results yet. Enter plates and click 'Check Plates' to begin."
                        : filter === "all"
                          ? "No plates match the current filter."
                          : `No ${filter} plates found.`}
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="sticky top-0 border-b border-gray-700 bg-gray-800">
                        <tr>
                          <th
                            className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700"
                            onClick={() => handleSort("plate")}
                          >
                            <div className="flex items-center gap-2">
                              Plate
                              {sortField === "plate" && <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                            </div>
                          </th>
                          <th
                            className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700"
                            onClick={() => handleSort("status")}
                          >
                            <div className="flex items-center gap-2">
                              Status
                              {sortField === "status" && <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                            </div>
                          </th>
                          <th
                            className="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700"
                            onClick={() => handleSort("timestamp")}
                          >
                            <div className="flex items-center gap-2">
                              Time Checked
                              {sortField === "timestamp" && <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                            </div>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {filteredAndSortedResults.map((result) => (
                          <tr key={result.plate} className="transition-colors hover:bg-gray-800">
                            <td className="px-4 py-3">
                              <span className="font-mono font-bold text-white">{result.plate}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block rounded px-3 py-1 text-xs font-semibold ${getStatusColor(result.status)}`}>
                                {result.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-400">{result.timestamp.toLocaleTimeString()}</td>
                            <td className="px-4 py-3 text-sm text-gray-400">{result.error || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div ref={resultsEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
