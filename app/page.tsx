"use client";

import { useState } from "react";
import { VerseResult } from "@/lib/types";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [verses, setVerses] = useState<VerseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setError("");
    setVerses([]);

    try {
      const res = await fetch("/api/verse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load verses.");
      }

      setVerses(data.verses || []);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (verse: VerseResult, index: number) => {
    const textToCopy = `"${verse.text}" — ${verse.reference} (NLT)`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const desiringGodUrl = topic.trim()
    ? `https://www.desiringgod.org/search/results?q=${encodeURIComponent(topic.trim())}`
    : null;

  return (
    <main className="min-h-screen bg-[#1C1917] text-[#E7E5E4] px-4 py-8 font-sans antialiased">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* Header */}
        <header className="text-center space-y-2 pt-2">
          <h1 className="text-2xl font-serif font-semibold text-[#F59E0B] tracking-wide">
            Scripture & Truth
          </h1>
          <p className="text-xs text-[#A8A29E] uppercase tracking-wider font-medium">
            NLT Verse Finder
          </p>
        </header>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter a topic or emotion..."
              className="w-full bg-[#292524] border border-[#44403C] rounded-xl px-4 py-3.5 text-base text-[#F5F5F4] placeholder-[#78716C] focus:outline-none focus:border-[#F59E0B] transition-colors shadow-inner"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#F59E0B] hover:bg-[#D97706] active:bg-[#B45309] text-[#1C1917] font-semibold py-3.5 px-4 rounded-xl shadow transition-all duration-150 disabled:opacity-50 text-base"
          >
            {loading ? "Searching Scripture..." : "Find Verses"}
          </button>
        </form>

        {/* Error State */}
        {error && (
          <div className="p-4 bg-[#451A03] border border-[#78350F] rounded-xl text-xs text-[#FDBA74] text-center">
            {error}
          </div>
        )}

        {/* Results Area */}
        {verses.length > 0 && (
          <div className="space-y-4 pt-2">
            
            {/* Desiring God Quick Action Link */}
            {desiringGodUrl && (
              <a
                href={desiringGodUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full bg-[#292524] hover:bg-[#38332E] border border-[#44403C] px-4 py-3 rounded-xl text-xs text-[#F59E0B] font-medium transition-colors"
              >
                <span>Explore &ldquo;{topic}&rdquo; on DesiringGod.org</span>
                <span className="text-base">↗</span>
              </a>
            )}

            {/* Verse Cards */}
            {verses.map((verse, index) => (
              <article
                key={index}
                className="bg-[#292524] border border-[#44403C] rounded-2xl p-5 space-y-3.5 shadow-md"
              >
                <div className="flex items-center justify-between border-b border-[#38332E] pb-2.5">
                  <h2 className="text-sm font-serif font-bold text-[#F59E0B] tracking-wide">
                    {verse.reference}
                  </h2>
                  <span className="text-[10px] bg-[#38332E] text-[#A8A29E] px-2 py-0.5 rounded font-mono uppercase">
                    NLT
                  </span>
                </div>

                <p className="text-sm text-[#F5F5F4] leading-relaxed font-serif italic">
                  &ldquo;{verse.text}&rdquo;
                </p>

                <p className="text-xs text-[#A8A29E] leading-normal pt-1">
                  {verse.context}
                </p>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => copyToClipboard(verse, index)}
                    className="text-xs bg-[#38332E] hover:bg-[#44403C] text-[#E7E5E4] px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center space-x-1.5"
                  >
                    <span>{copiedIndex === index ? "Copied! ✓" : "Copy Verse"}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
