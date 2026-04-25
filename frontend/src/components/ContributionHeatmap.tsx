"use client";

import { useEffect, useState } from "react";
import { GitCommit, TrendingUp, Calendar, Flame } from "lucide-react";

interface WeekData {
    week: number;    // UNIX epoch (start of week)
    total: number;
    days: number[];  // [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
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

// Colour intensity scale (dark theme — green family)
function getCellColor(count: number, max: number): string {
    if (count === 0) return "rgba(255,255,255,0.04)";
    const ratio = Math.min(count / Math.max(max, 1), 1);
    if (ratio < 0.25) return "rgba(74,222,128,0.25)";
    if (ratio < 0.50) return "rgba(74,222,128,0.50)";
    if (ratio < 0.75) return "rgba(34,197,94,0.72)";
    return "rgba(22,163,74,0.95)";
}

// Format epoch to short month label
function epochToMonth(epoch: number): string {
    const d = new Date(epoch * 1000);
    return d.toLocaleString("default", { month: "short" });
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
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(d => {
                setData(d);
                setLoading(false);
            })
            .catch(e => {
                setError(e.message);
                setLoading(false);
            });
    }, [repoId]);

    if (loading) {
        return (
            <div className="rounded-2xl border border-white/8 p-6 animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="h-4 bg-white/10 rounded w-48 mb-4" />
                <div className="grid grid-cols-[repeat(52,1fr)] gap-0.5">
                    {Array.from({ length: 52 * 7 }).map((_, i) => (
                        <div key={i} className="w-3 h-3 rounded-sm bg-white/5" />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !data || data.weeks.length === 0) {
        return (
            <div
                className="rounded-2xl border border-white/8 p-6"
                style={{ background: "rgba(255,255,255,0.03)" }}
            >
                <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-400">Contribution Heatmap</span>
                </div>
                <p className="text-xs text-slate-500 italic">
                    {error?.includes("404")
                        ? "Heatmap unavailable — re-ingest the repository to enable this feature."
                        : "Heatmap data could not be loaded."}
                </p>
            </div>
        );
    }

    const { weeks, summary, owner, repo_name } = data;
    const maxCommits = Math.max(...weeks.map(w => w.total), 1);

    // Build month label positions (show label when month changes across weeks)
    const monthLabels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    weeks.forEach((w, i) => {
        const m = new Date(w.week * 1000).getMonth();
        if (m !== lastMonth) {
            monthLabels.push({ col: i, label: epochToMonth(w.week) });
            lastMonth = m;
        }
    });

    return (
        <div
            className="rounded-2xl border border-white/8 p-6"
            style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)" }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
                    >
                        <GitCommit className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Contribution Activity</h3>
                        <p className="text-xs text-slate-400">
                            <a
                                href={`https://github.com/${owner}/${repo_name}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-green-400 transition-colors"
                            >
                                {owner}/{repo_name}
                            </a>
                            {" · "}Last 52 weeks
                        </p>
                    </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-3 flex-wrap">
                    <StatPill icon={<GitCommit className="w-3 h-3" />} label="Total" value={summary.total_commits} color="text-green-400" />
                    <StatPill icon={<Flame className="w-3 h-3" />} label="Peak week" value={summary.peak_week_commits} color="text-orange-400" />
                    <StatPill icon={<TrendingUp className="w-3 h-3" />} label="Consistency" value={`${summary.consistency_score}%`} color="text-blue-400" />
                </div>
            </div>

            {/* Heatmap grid */}
            <div className="overflow-x-auto pb-1">
                <div className="inline-block min-w-full">
                    {/* Month labels */}
                    <div className="flex mb-1 relative" style={{ paddingLeft: "20px" }}>
                        {monthLabels.map(({ col, label }) => (
                            <div
                                key={`${col}-${label}`}
                                className="absolute text-[10px] text-slate-500 font-medium"
                                style={{ left: `calc(20px + ${col} * (14px))` }}
                            >
                                {label}
                            </div>
                        ))}
                        <div style={{ height: "14px" }} />
                    </div>

                    {/* Day labels + grid */}
                    <div className="flex gap-0.5">
                        {/* Day of week labels */}
                        <div className="flex flex-col gap-0.5 mr-1 justify-around">
                            {["", "M", "", "W", "", "F", ""].map((d, i) => (
                                <div key={i} className="text-[9px] text-slate-600 w-3.5 text-center leading-3 h-3">
                                    {d}
                                </div>
                            ))}
                        </div>

                        {/* Week columns */}
                        {weeks.map((week, wi) => (
                            <div key={week.week} className="flex flex-col gap-0.5">
                                {week.days.map((count, di) => {
                                    const date = new Date((week.week + di * 86400) * 1000);
                                    const dateStr = date.toLocaleDateString("en-US", {
                                        month: "short", day: "numeric", year: "numeric"
                                    });
                                    return (
                                        <div
                                            key={di}
                                            className="w-3 h-3 rounded-sm cursor-default transition-all duration-100 hover:scale-125 hover:z-10 relative"
                                            style={{
                                                background: getCellColor(count, maxCommits),
                                                border: hoveredCell?.week === wi && hoveredCell?.day === di
                                                    ? "1px solid rgba(255,255,255,0.4)"
                                                    : "1px solid transparent",
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

            {/* Tooltip */}
            {hoveredCell && (
                <div
                    className="mt-2 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-white/8 inline-block"
                    style={{ background: "rgba(15,23,42,0.8)" }}
                >
                    <strong className="text-white">{hoveredCell.count} commit{hoveredCell.count !== 1 ? "s" : ""}</strong>
                    {" on "}
                    {hoveredCell.date}
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-3">
                <span className="text-[10px] text-slate-600">Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map((r) => (
                    <div
                        key={r}
                        className="w-3 h-3 rounded-sm"
                        style={{ background: r === 0 ? "rgba(255,255,255,0.04)" : getCellColor(Math.round(r * maxCommits), maxCommits) }}
                    />
                ))}
                <span className="text-[10px] text-slate-600">More</span>
            </div>
        </div>
    );
}

function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
    return (
        <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/8 text-xs"
            style={{ background: "rgba(255,255,255,0.03)" }}
        >
            <span className={color}>{icon}</span>
            <span className="text-slate-400">{label}:</span>
            <span className={`font-bold ${color}`}>{value}</span>
        </div>
    );
}
