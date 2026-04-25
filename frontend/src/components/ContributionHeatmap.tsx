"use client";

import { useEffect, useState } from "react";
import { GitCommit, TrendingUp, Calendar, Flame } from "lucide-react";

interface WeekData {
    week: number;
    total: number;
    days: number[];
}

interface HeatmapSummary {
    total_commits: number;
    active_weeks: number;
    inactive_weeks: number;
    peak_week_commits: number;
    consistency_score: number;
}

interface HeatmapData {
    repo_id: string;
    owner: string;
    repo_name: string;
    weeks: WeekData[];
    summary: HeatmapSummary;
}

interface ContributionHeatmapProps {
    repoId: string;
}

function getCellColor(count: number, max: number): string {
    if (count === 0) return "#f1f5f9";   // slate-100 — matches light theme
    const ratio = Math.min(count / Math.max(max, 1), 1);
    if (ratio < 0.25) return "#bbf7d0";  // green-200
    if (ratio < 0.50) return "#4ade80";  // green-400
    if (ratio < 0.75) return "#16a34a";  // green-600
    return "#14532d";                    // green-900
}

function epochToMonth(epoch: number): string {
    return new Date(epoch * 1000).toLocaleString("default", { month: "short" });
}

export default function ContributionHeatmap({ repoId }: ContributionHeatmapProps) {
    const [data, setData] = useState<HeatmapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hoveredCell, setHoveredCell] = useState<{ week: number; day: number; count: number; date: string } | null>(null);

    useEffect(() => {
        if (!repoId) return;
        setLoading(true);
        setError(null);
        fetch(`/api/heatmap/${repoId}`)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setData(d); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, [repoId]);

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse">
                <div className="h-4 bg-slate-100 rounded w-48 mb-4" />
                <div className="flex gap-0.5">
                    {Array.from({ length: 52 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                            {Array.from({ length: 7 }).map((_, j) => (
                                <div key={j} className="w-3 h-3 rounded-sm bg-slate-100" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error || !data || data.weeks.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-1">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-600">Contribution Heatmap</span>
                </div>
                <p className="text-xs text-slate-400 italic">
                    {error?.includes("404")
                        ? "Heatmap unavailable — re-ingest the repository to enable this feature."
                        : "Heatmap data could not be loaded."}
                </p>
            </div>
        );
    }

    const { weeks, summary, owner, repo_name } = data;
    const maxCommits = Math.max(...weeks.map(w => w.total), 1);

    const monthLabels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    weeks.forEach((w, i) => {
        const m = new Date(w.week * 1000).getMonth();
        if (m !== lastMonth) { monthLabels.push({ col: i, label: epochToMonth(w.week) }); lastMonth = m; }
    });

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-sm">
                        <GitCommit className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-base">Contribution Activity</h3>
                        <p className="text-xs text-slate-500">
                            <a
                                href={`https://github.com/${owner}/${repo_name}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-green-600 transition-colors"
                            >
                                {owner}/{repo_name}
                            </a>
                            {" · "}Last 52 weeks
                        </p>
                    </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                    <StatPill icon={<GitCommit className="w-3 h-3" />} label="Commits" value={summary.total_commits} color="text-emerald-600" bg="bg-emerald-50 border-emerald-200" />
                    <StatPill icon={<Flame className="w-3 h-3" />} label="Peak" value={summary.peak_week_commits} color="text-orange-600" bg="bg-orange-50 border-orange-200" />
                    <StatPill icon={<TrendingUp className="w-3 h-3" />} label="Consistency" value={`${summary.consistency_score}%`} color="text-blue-600" bg="bg-blue-50 border-blue-200" />
                </div>
            </div>

            {/* Grid */}
            <div className="overflow-x-auto">
                <div className="inline-block">
                    {/* Month labels */}
                    <div className="flex mb-1 relative" style={{ paddingLeft: "20px" }}>
                        {monthLabels.map(({ col, label }) => (
                            <div
                                key={`${col}-${label}`}
                                className="absolute text-[10px] text-slate-400 font-medium"
                                style={{ left: `calc(20px + ${col} * 14px)` }}
                            >
                                {label}
                            </div>
                        ))}
                        <div style={{ height: "14px" }} />
                    </div>

                    <div className="flex gap-0.5">
                        {/* Day labels */}
                        <div className="flex flex-col gap-0.5 mr-1 justify-around">
                            {["", "M", "", "W", "", "F", ""].map((d, i) => (
                                <div key={i} className="text-[9px] text-slate-400 w-3.5 text-center leading-3 h-3">{d}</div>
                            ))}
                        </div>

                        {/* Week columns */}
                        {weeks.map((week, wi) => (
                            <div key={week.week} className="flex flex-col gap-0.5">
                                {week.days.map((count, di) => {
                                    const date = new Date((week.week + di * 86400) * 1000);
                                    const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                                    const isHovered = hoveredCell?.week === wi && hoveredCell?.day === di;
                                    return (
                                        <div
                                            key={di}
                                            className="w-3 h-3 rounded-sm cursor-default transition-all duration-75 hover:scale-150 hover:z-10"
                                            style={{
                                                background: getCellColor(count, maxCommits),
                                                outline: isHovered ? "2px solid #6366f1" : "none",
                                                outlineOffset: "1px",
                                            }}
                                            onMouseEnter={() => setHoveredCell({ week: wi, day: di, count, date: dateStr })}
                                            onMouseLeave={() => setHoveredCell(null)}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Hover tooltip */}
            <div className="mt-3 h-6">
                {hoveredCell ? (
                    <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 inline-block">
                        <strong className="text-slate-800">{hoveredCell.count} commit{hoveredCell.count !== 1 ? "s" : ""}</strong>
                        {" on "}{hoveredCell.date}
                    </span>
                ) : null}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400">Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map(r => (
                    <div
                        key={r}
                        className="w-3 h-3 rounded-sm border border-slate-200"
                        style={{ background: getCellColor(Math.round(r * maxCommits), maxCommits) }}
                    />
                ))}
                <span className="text-[10px] text-slate-400">More</span>
            </div>
        </div>
    );
}

function StatPill({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number | string; color: string; bg: string }) {
    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${bg}`}>
            <span className={color}>{icon}</span>
            <span className="text-slate-500">{label}:</span>
            <span className={`font-bold ${color}`}>{value}</span>
        </div>
    );
}
