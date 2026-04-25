"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis,
    ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { Target, TrendingUp, ChevronDown, Loader2, ArrowUp, ArrowDown, Minus } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SkillEntry {
    topic: string;
    score: number;
    status: string;
}

interface SkillRadarProps {
    verifiedSkills: SkillEntry[];
}

interface ChartDatum {
    topic: string;
    fullTopic: string;
    Candidate: number;
    Benchmark: number;
}

// ─── Role options ─────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
    { slug: "software-engineer",        label: "Software Engineer" },
    { slug: "senior-software-engineer", label: "Senior Software Engineer" },
    { slug: "backend-engineer",         label: "Backend Engineer" },
    { slug: "frontend-engineer",        label: "Frontend Engineer" },
    { slug: "fullstack-engineer",       label: "Full-Stack Engineer" },
    { slug: "data-scientist",           label: "Data Scientist" },
    { slug: "ml-engineer",              label: "ML Engineer" },
    { slug: "data-engineer",            label: "Data Engineer" },
    { slug: "devops-engineer",          label: "DevOps Engineer" },
    { slug: "nlp-engineer",             label: "NLP Engineer" },
];

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const candidate = payload.find((p: any) => p.name === "Candidate")?.value ?? 0;
    const benchmark = payload.find((p: any) => p.name === "Benchmark")?.value ?? 0;
    const delta = candidate - benchmark;
    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl text-sm min-w-[180px]">
            <p className="font-bold text-slate-800 mb-2 text-xs uppercase tracking-wider">{label}</p>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-indigo-600">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                        Your Score
                    </span>
                    <span className="font-bold text-indigo-600">{candidate}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-amber-600">
                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                        Benchmark
                    </span>
                    <span className="font-bold text-amber-600">{benchmark}</span>
                </div>
                <div className="border-t border-slate-100 pt-1.5 flex items-center justify-between">
                    <span className="text-slate-500 text-xs">Gap</span>
                    <span className={`font-bold text-xs ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {delta >= 0 ? "+" : ""}{delta}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ─── Score summary card ───────────────────────────────────────────────────────
function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${color}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
            <span className="text-xl font-black mt-0.5">{value}</span>
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function RadarSkeleton({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3" style={{ height: 360 }}>
            <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
                </div>
            </div>
            <div className="text-center">
                <p className="text-sm font-semibold text-slate-600">{message}</p>
                <p className="text-xs text-slate-400 mt-0.5">This takes a few seconds…</p>
            </div>
            {/* Shimmer bars */}
            <div className="w-48 space-y-2 mt-2">
                {[80, 60, 72, 45].map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-slate-100 animate-pulse" style={{ width: `${w}%` }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SkillRadar({ verifiedSkills }: SkillRadarProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const [selectedRole, setSelectedRole] = useState(ROLE_OPTIONS[0]);
    const [benchmark, setBenchmark] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Use candidate's exact topic names for benchmark generation
    const topics = verifiedSkills.map(s => s.topic);

    const fetchBenchmark = useCallback(async (roleLabel: string) => {
        if (topics.length === 0) return;
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch("/api/benchmarks/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role_description: roleLabel,
                    skill_topics: topics,
                }),
            });
            if (!res.ok) throw new Error(`API ${res.status}`);
            const data = await res.json();
            setBenchmark(data.scores ?? {});
        } catch (e: any) {
            setLoadError("Could not load benchmark — using candidate scores only.");
            console.error("Benchmark fetch failed:", e);
        } finally {
            setLoading(false);
        }
    }, [topics.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch on mount and when skills change
    useEffect(() => {
        fetchBenchmark(selectedRole.label);
    }, [fetchBenchmark]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRoleSelect = (role: typeof ROLE_OPTIONS[number]) => {
        setSelectedRole(role);
        setDropdownOpen(false);
        fetchBenchmark(role.label);
    };

    if (verifiedSkills.length === 0) return null;

    // Build chart data — candidate's topics are the source of truth
    // Benchmark always has a score for each topic (LLM generates for exact topics)
    const MAX_TOPICS = 12;
    const chartData: ChartDatum[] = verifiedSkills.slice(0, MAX_TOPICS).map(skill => ({
        topic: skill.topic.length > 18 ? skill.topic.slice(0, 16) + "…" : skill.topic,
        fullTopic: skill.topic,
        Candidate: skill.score,
        Benchmark: benchmark[skill.topic] ?? 0,
    }));

    // Summary stats
    const avgCandidate = chartData.length
        ? Math.round(chartData.reduce((s, d) => s + d.Candidate, 0) / chartData.length)
        : 0;
    const avgBenchmark = Object.keys(benchmark).length && chartData.length
        ? Math.round(chartData.reduce((s, d) => s + d.Benchmark, 0) / chartData.length)
        : null;
    const matchPct = avgBenchmark
        ? Math.min(100, Math.round((avgCandidate / avgBenchmark) * 100))
        : null;

    // Gap analysis
    const gaps = chartData
        .filter(d => d.Benchmark > 0 && d.Benchmark - d.Candidate > 5)
        .sort((a, b) => (b.Benchmark - b.Candidate) - (a.Benchmark - a.Candidate))
        .slice(0, 5);

    const strengths = chartData
        .filter(d => d.Benchmark > 0 && d.Candidate - d.Benchmark > 5)
        .sort((a, b) => (b.Candidate - b.Benchmark) - (a.Candidate - a.Benchmark))
        .slice(0, 3);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm flex-shrink-0">
                        <Target className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Skill Radar</h3>
                        <p className="text-xs text-slate-500">Your verified skills vs industry benchmark for selected role</p>
                    </div>
                </div>

                {/* Role selector */}
                <div className="relative">
                    <button
                        id="radar-role-selector"
                        onClick={() => setDropdownOpen(v => !v)}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50 transition-all duration-200 disabled:opacity-60 shadow-sm"
                    >
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                        {loading
                            ? <span className="text-slate-400 font-normal">Generating…</span>
                            : selectedRole.label}
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {dropdownOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-slate-200 bg-white shadow-2xl z-50 overflow-hidden py-1">
                            {ROLE_OPTIONS.map(role => (
                                <button
                                    key={role.slug}
                                    id={`radar-role-${role.slug}`}
                                    onClick={() => handleRoleSelect(role)}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                        selectedRole.slug === role.slug
                                            ? "bg-indigo-50 text-indigo-700 font-semibold"
                                            : "text-slate-700 hover:bg-slate-50"
                                    }`}
                                >
                                    {role.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-6">
                {/* Score summary pills */}
                {!loading && avgBenchmark !== null && (
                    <div className="flex items-center gap-3 mb-5 flex-wrap">
                        <ScorePill
                            label="Your Avg"
                            value={avgCandidate}
                            color="border-indigo-200 bg-indigo-50 text-indigo-700"
                        />
                        <ScorePill
                            label="Benchmark Avg"
                            value={avgBenchmark}
                            color="border-amber-200 bg-amber-50 text-amber-700"
                        />
                        {matchPct !== null && (
                            <div className={`flex flex-col items-center px-4 py-2 rounded-xl border ${matchPct >= 90 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : matchPct >= 70 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Match</span>
                                <span className="text-xl font-black mt-0.5">{matchPct}%</span>
                            </div>
                        )}
                        <p className="text-xs text-slate-400 italic ml-auto">
                            Benchmark auto-generated by AI for {selectedRole.label}
                        </p>
                    </div>
                )}

                {/* Error */}
                {loadError && (
                    <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                        ⚠️ {loadError}
                    </div>
                )}

                {/* Chart */}
                {!mounted || loading ? (
                    <RadarSkeleton message={loading ? `Generating ${selectedRole.label} benchmark…` : "Preparing chart…"} />
                ) : (
                    <div style={{ height: 460 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={chartData} margin={{ top: 20, right: 50, bottom: 20, left: 50 }}>
                                <PolarGrid
                                    stroke="#e2e8f0"
                                    gridType="polygon"
                                />
                                <PolarAngleAxis
                                    dataKey="topic"
                                    tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                                    tickLine={false}
                                />
                                <Radar
                                    name="Candidate"
                                    dataKey="Candidate"
                                    stroke="#6366f1"
                                    fill="#6366f1"
                                    fillOpacity={0.25}
                                    strokeWidth={2.5}
                                />
                                <Radar
                                    name="Benchmark"
                                    dataKey="Benchmark"
                                    stroke="#f59e0b"
                                    fill="#f59e0b"
                                    fillOpacity={0.08}
                                    strokeWidth={2}
                                    strokeDasharray="5 3"
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ paddingTop: 16, fontSize: 13 }}
                                    formatter={(value) => (
                                        <span style={{ color: value === "Candidate" ? "#6366f1" : "#d97706", fontWeight: 600 }}>
                                            {value === "Candidate" ? "Your Skills" : `${selectedRole.label} Benchmark`}
                                        </span>
                                    )}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Gap + Strength analysis */}
                {!loading && (gaps.length > 0 || strengths.length > 0) && (
                    <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Gaps to close */}
                        {gaps.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <ArrowUp className="w-3 h-3 text-red-400" />
                                    Areas to Improve
                                </p>
                                <div className="space-y-1.5">
                                    {gaps.map(d => (
                                        <div key={d.fullTopic} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                                            <span className="text-xs font-medium text-slate-700 truncate">{d.fullTopic}</span>
                                            <span className="text-xs font-bold text-red-600 flex-shrink-0 flex items-center gap-0.5">
                                                <ArrowUp className="w-3 h-3" />+{d.Benchmark - d.Candidate}pts
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Strengths */}
                        {strengths.length > 0 && (
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <ArrowDown className="w-3 h-3 text-emerald-500" />
                                    Above Benchmark
                                </p>
                                <div className="space-y-1.5">
                                    {strengths.map(d => (
                                        <div key={d.fullTopic} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                                            <span className="text-xs font-medium text-slate-700 truncate">{d.fullTopic}</span>
                                            <span className="text-xs font-bold text-emerald-600 flex-shrink-0 flex items-center gap-0.5">
                                                <ArrowUp className="w-3 h-3" />+{d.Candidate - d.Benchmark}pts
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
