"use client";

import { useMemo, useEffect, useRef } from "react";

interface TimelineEntry {
    name: string;
    path: string;
    first_seen: string | null;
    last_modified: string | null;
}

interface SkillTimelineProps {
    timeline: Record<string, TimelineEntry[]>;
}

const LANG_COLORS: Record<string, string> = {
    python:     "#3572A5",
    javascript: "#f1e05a",
    typescript: "#3178c6",
    java:       "#b07219",
    go:         "#00ADD8",
    rust:       "#dea584",
    cpp:        "#f34b7d",
    c:          "#555555",
    ruby:       "#701516",
    swift:      "#F05138",
    kotlin:     "#A97BFF",
    unknown:    "#64748b",
};

function isStale(date: string | null): boolean {
    if (!date) return false;
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    return new Date(date) < twoYearsAgo;
}

function formatDate(date: string | null): string {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

// ─── Single language row ──────────────────────────────────────────────────────
function LangRow({ lang, entries, index }: { lang: string; entries: TimelineEntry[]; index: number }) {
    const barRef = useRef<HTMLDivElement>(null);
    const color = LANG_COLORS[lang.toLowerCase()] || LANG_COLORS.unknown;

    const lastModified = entries.map(e => e.last_modified).filter(Boolean).sort().reverse()[0] || null;
    const firstSeen    = entries.map(e => e.first_seen).filter(Boolean).sort()[0] || null;
    const stale = isStale(lastModified);

    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        // Animate width from 0 to 100%
        bar.style.width = "0%";
        const timer = setTimeout(() => {
            bar.style.width = "100%";
        }, 80 + index * 60);
        return () => clearTimeout(timer);
    }, [index]);

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 animate-slide-in-left hover:shadow-sm ${
                stale
                    ? "border-amber-200 bg-amber-50 hover:border-amber-300"
                    : "border-slate-200 bg-white hover:border-slate-300"
            }`}
            style={{ animationDelay: `${index * 60}ms` }}
        >
            {/* Language color dot */}
            <div
                className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}66` }}
            />

            {/* Language name */}
            <span className="text-sm font-semibold text-slate-800 capitalize w-24 flex-shrink-0">{lang}</span>

            {/* Timeline bar */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-[11px] text-slate-400 w-16 text-right flex-shrink-0">{formatDate(firstSeen)}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden relative">
                    <div
                        ref={barRef}
                        className="h-full rounded-full"
                        style={{
                            backgroundColor: stale ? "#f59e0b" : color,
                            opacity: stale ? 0.5 : 0.85,
                            transition: "width 800ms cubic-bezier(0.4, 0, 0.2, 1)",
                            boxShadow: stale ? "none" : `0 0 6px ${color}44`,
                        }}
                    />
                </div>
                <span className="text-[11px] text-slate-400 w-16 flex-shrink-0">{formatDate(lastModified)}</span>
            </div>

            {/* File count */}
            <span className="text-xs text-slate-500 flex-shrink-0 w-14 text-right">
                {entries.length} file{entries.length !== 1 ? "s" : ""}
            </span>

            {/* Stale badge */}
            {stale && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200 flex-shrink-0 animate-pulse">
                    STALE
                </span>
            )}
        </div>
    );
}

// ─── Main Timeline ─────────────────────────────────────────────────────────────
export default function SkillTimeline({ timeline }: SkillTimelineProps) {
    const languages = useMemo(() => Object.keys(timeline), [timeline]);

    if (languages.length === 0) {
        return (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                No timeline data available
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="text-base">📅</span>
                Skill Activity Timeline
                <span className="text-xs font-normal text-slate-400 ml-1">({languages.length} languages)</span>
            </h3>
            <div className="space-y-2">
                {languages.map((lang, idx) => (
                    <LangRow
                        key={lang}
                        lang={lang}
                        entries={timeline[lang]}
                        index={idx}
                    />
                ))}
            </div>
        </div>
    );
}
