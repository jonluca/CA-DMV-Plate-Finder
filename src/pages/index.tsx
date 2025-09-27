import Head from "next/head";
import { useState, useEffect, useRef } from "react";
import { api } from "~/utils/api";
import { skipToken } from "@tanstack/react-query";

interface PlateResult {
  plate: string;
  status: "AVAILABLE" | "UNAVAILABLE" | "ERROR" | "CHECKING";
  timestamp: Date;
  error?: string;
  totalChecked?: number;
}

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [plates, setPlates] = useState<string[]>([]);
  const [results, setResults] = useState<PlateResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const resultsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    resultsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [results]);

  api.plateChecker.checkPlates.useSubscription(
    isChecking ? { plates } : skipToken,
    {
      onData: (trackedData) => {
        const data = trackedData.data;
        setResults(prev => [...prev, data]);
        if (data.plate === "SYSTEM" && data.status === "CHECKING") {
          setConnectionStatus("connected");
        }
      },
      onError: (err) => {
        console.error("Subscription error:", err);
        setConnectionStatus("error");
        setIsChecking(false);
      },
    }
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const parsePlates = (text: string): string[] => {
    const plateRegex = /[A-Za-z0-9]{1,7}/g;
    const matches = text.match(plateRegex) || [];
    return [...new Set(matches.filter(p => p.length >= 1 && p.length <= 7))];
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
  };

  const availableCount = results.filter(r => r.status === "AVAILABLE").length;
  const unavailableCount = results.filter(r => r.status === "UNAVAILABLE").length;
  const errorCount = results.filter(r => r.status === "ERROR").length;
  const totalChecked = results.filter(r => r.plate !== "SYSTEM").length;

  const getStatusColor = (status: PlateResult["status"]) => {
    switch (status) {
      case "AVAILABLE":
        return "text-green-400 font-bold";
      case "UNAVAILABLE":
        return "text-red-400";
      case "ERROR":
        return "text-yellow-400";
      case "CHECKING":
        return "text-blue-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <>
      <Head>
        <title>CA DMV Plate Finder</title>
        <meta name="description" content="Check California DMV plate availability" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <h1 className="text-4xl font-bold mb-8 text-center">
            California DMV <span className="text-blue-400">Plate Checker</span>
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Enter Plates to Check</h2>
                <textarea
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="Enter plates separated by spaces, commas, or new lines&#10;Example: ABC123 XYZ789 PLATE1"
                  className="w-full h-40 p-4 bg-gray-700 text-white rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isChecking}
                />
                <div className="mt-4 text-sm text-gray-400">
                  Detected plates: {parsePlates(inputText).length}
                </div>
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
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Connection:</span>
                    <span className={`font-semibold ${
                      connectionStatus === "connected" ? "text-green-400" :
                      connectionStatus === "connecting" ? "text-yellow-400" :
                      connectionStatus === "error" ? "text-red-400" :
                      "text-gray-400"
                    }`}>
                      {connectionStatus.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              {availableCount > 0 && (
                <div className="bg-green-900/30 border border-green-500 rounded-lg p-4">
                  <h3 className="text-green-400 font-semibold mb-2">Available Plates Found!</h3>
                  <div className="space-y-1">
                    {results
                      .filter(r => r.status === "AVAILABLE")
                      .map((result, idx) => (
                        <div key={idx} className="font-mono text-green-300">
                          {result.plate}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Results</h2>
              <div className="h-[600px] overflow-y-auto bg-gray-900 rounded-lg p-4">
                {results.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    No results yet. Enter plates and click "Check Plates" to begin.
                  </div>
                ) : (
                  <div className="space-y-2 font-mono text-sm">
                    {results.map((result, index) => (
                      <div
                        key={index}
                        className={`${
                          result.plate === "SYSTEM"
                            ? "text-gray-500 italic"
                            : "flex justify-between items-center"
                        }`}
                      >
                        {result.plate === "SYSTEM" ? (
                          <span>→ {result.error}</span>
                        ) : (
                          <>
                            <span className="font-bold">{result.plate}</span>
                            <span className={getStatusColor(result.status)}>
                              {result.status}
                              {result.error && <span className="ml-2 text-xs">({result.error})</span>}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                    <div ref={resultsEndRef} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}