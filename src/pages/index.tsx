import Head from "next/head";
import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "~/utils/api";
import { skipToken } from "@tanstack/react-query";

interface PlateResult {
  plate: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "ERROR" | "CHECKING";
  timestamp: Date;
  error?: string;
  totalChecked?: number;
}

type FilterType = "all" | "available" | "unavailable" | "error";
type SortField = "plate" | "status" | "timestamp";
type SortDirection = "asc" | "desc";

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [plates, setPlates] = useState<string[]>([]);
  const [results, setResults] = useState<PlateResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
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

  api.plateChecker.checkPlates.useSubscription(isChecking ? { plates } : skipToken, {
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
      if (data.plate === "SYSTEM" && data.status === "CHECKING") {
        setConnectionStatus("connected");
      }
    },
    onError: (err) => {
      console.error("Subscription error:", err);
      setConnectionStatus("error");
      setIsChecking(false);
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const parsePlates = (text: string): string[] => {
    const plateRegex = /[A-Za-z0-9]{1,7}/g;
    const matches = text.match(plateRegex) || [];
    return [...new Set(matches.filter((p) => p.length >= 1 && p.length <= 7))];
  };

  const handleCheckPlates = () => {
    const parsedPlates = parsePlates(inputText);
    if (parsedPlates.length === 0) {
      alert("Please enter at least one valid plate (1-7 characters)");
      return;
    }

    setPlates(parsedPlates);
    setResults([]);
    setIsChecking(true);
    setConnectionStatus("connecting");
    setFilter("all");
  };

  const handleStop = () => {
    setIsChecking(false);
    setConnectionStatus("idle");
  };

  const handleClear = () => {
    setInputText("");
    setPlates([]);
    setResults([]);
    setIsChecking(false);
    setConnectionStatus("idle");
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
  const errorCount = plateResults.filter((r) => r.status === "ERROR").length;
  const checkingCount = plateResults.filter((r) => r.status === "CHECKING").length;
  const totalChecked = plateResults.filter((r) => r.status !== "CHECKING").length;

  const getStatusColor = (status: PlateResult["status"]) => {
    switch (status) {
      case "AVAILABLE":
        return "bg-green-500 text-white";
      case "UNAVAILABLE":
        return "bg-red-500 text-white";
      case "ERROR":
        return "bg-yellow-500 text-black";
      case "CHECKING":
        return "bg-blue-500 text-white animate-pulse";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getStatusBorder = (status: PlateResult["status"]) => {
    switch (status) {
      case "AVAILABLE":
        return "border-green-400";
      case "UNAVAILABLE":
        return "border-red-400";
      case "ERROR":
        return "border-yellow-400";
      case "CHECKING":
        return "border-blue-400";
      default:
        return "border-gray-400";
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
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <h1 className="text-4xl font-bold mb-8 text-center">
            California DMV <span className="text-blue-400">Plate Checker</span>
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Enter Plates to Check</h2>
                <textarea
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="Enter plates separated by spaces, commas, or new lines&#10;Example: ABC123 XYZ789 PLATE1"
                  className="w-full h-40 p-4 bg-gray-700 text-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isChecking}
                />
                <div className="mt-4 text-sm text-gray-400">Detected plates: {parsePlates(inputText).length}</div>
              </div>

              <div className="flex gap-4">
                {!isChecking ? (
                  <>
                    <button
                      onClick={handleCheckPlates}
                      disabled={parsePlates(inputText).length === 0}
                      className="flex-1 py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                    >
                      Check Plates
                    </button>
                    <button
                      onClick={handleClear}
                      className="py-3 px-6 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStop}
                    className="flex-1 py-3 px-6 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
                  >
                    Stop Checking
                  </button>
                )}
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Statistics</h3>
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
                    <span className="font-semibold text-yellow-400">{errorCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Connection:</span>
                    <span
                      className={`font-semibold ${
                        connectionStatus === "connected"
                          ? "text-green-400"
                          : connectionStatus === "connecting"
                            ? "text-yellow-400"
                            : connectionStatus === "error"
                              ? "text-red-400"
                              : "text-gray-400"
                      }`}
                    >
                      {connectionStatus.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="text-xs text-gray-500">Processing with 10x parallelization</div>
                </div>
              </div>

              {systemMessages.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold mb-2 text-gray-400">System Status</h3>
                  <div className="space-y-1 text-xs text-gray-500">
                    {systemMessages.slice(-3).map((msg, idx) => (
                      <div key={idx}>→ {msg.error}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Results</h2>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setFilter("all")}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        filter === "all" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      All ({plateResults.length})
                    </button>
                    <button
                      onClick={() => setFilter("available")}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        filter === "available" ? "bg-green-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      Available ({availableCount})
                    </button>
                    <button
                      onClick={() => setFilter("unavailable")}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        filter === "unavailable" ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      Unavailable ({unavailableCount})
                    </button>
                    <button
                      onClick={() => setFilter("error")}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        filter === "error" ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      Errors ({errorCount})
                    </button>
                    {filteredAndSortedResults.length > 0 && (
                      <button
                        onClick={downloadCSV}
                        className="px-3 py-1 rounded text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        📥 Download CSV
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-[600px] overflow-auto bg-gray-900 rounded-lg">
                  {filteredAndSortedResults.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">
                      {plateResults.length === 0
                        ? "No results yet. Enter plates and click 'Check Plates' to begin."
                        : filter === "all"
                          ? "No plates match the current filter."
                          : `No ${filter} plates found.`}
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
                        <tr>
                          <th
                            className="px-4 py-3 text-left text-sm font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort("plate")}
                          >
                            <div className="flex items-center gap-2">
                              Plate
                              {sortField === "plate" && <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                            </div>
                          </th>
                          <th
                            className="px-4 py-3 text-left text-sm font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort("status")}
                          >
                            <div className="flex items-center gap-2">
                              Status
                              {sortField === "status" && <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                            </div>
                          </th>
                          <th
                            className="px-4 py-3 text-left text-sm font-semibold text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
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
                        {filteredAndSortedResults.map((result, index) => (
                          <tr key={`${result.plate}-${index}`} className="hover:bg-gray-800 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-mono font-bold text-white">{result.plate}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block py-1 px-3 rounded text-xs font-semibold ${getStatusColor(result.status)}`}>
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
