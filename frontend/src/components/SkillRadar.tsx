"use client";

import { useState, useEffect } from "react";
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis,
    ResponsiveContainer, Tooltip, Legend
} from "recharts";
import { Target, TrendingUp, ChevronDown, Loader2 } from "lucide-react";

interface SkillEntry {
    topic: string;
    score: number;
    status: string;
}

interface SkillRadarProps {
    verifiedSkills: SkillEntry[];
    benchmarkScores?: Record<string, number>;
    benchmarkLabel?: string;
}

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

// Case-insensitive normaliser for topic matching
const norm = (s: string) => s.toLowerCase().trim();

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl">
            <p className="font-bold text-slate-800 mb-1.5">{label}</p>
            {payload.map((entry: any) => (
                <p key={entry.name} className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: entry.color }} />
                    {entry.name}: <strong style={{ color: entry.color }}>{entry.value}</strong>
                </p>
            ))}
        </div>
    );
}

function RadarSkeleton() {
    return (
        <div className="flex items-center justify-center h-[420px]">
            <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Loading chart…</p>
            </div>
        </div>
    );
}

export default function SkillRadar({ verifiedSkills, benchmarkScores, benchmarkLabel }: SkillRadarProps) {
    // SSR guard — Recharts needs the DOM to measure containers
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const [selectedRole, setSelectedRole] = useState(ROLE_OPTIONS[0].slug);
    const [benchmark, setBenchmark] = useState<Record<string, number>>(benchmarkScores ?? {});
    const [benchLabel, setBenchLabel] = useState(benchmarkLabel ?? ROLE_OPTIONS[0].label);
    const [loading, setLoading] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Build candidate map with normalised keys
    const candidateMap: Record<string, { score: number; label: string }> = {};
    for (const skill of verifiedSkills) {
        candidateMap[norm(skill.topic)] = { score: skill.score, label: skill.topic };
    }

    // Build benchmark map with normalised keys
    const benchNorm: Record<string, { score: number; label: string }> = {};
    for (const [k, v] of Object.entries(benchmark)) {
        benchNorm[norm(k)] = { score: v, label: k };
    }

    // Merge all unique topics (prefer candidate label, fallback to benchmark label)
    const allNormKeys = Array.from(new Set([...Object.keys(candidateMap), ...Object.keys(benchNorm)]));
    const top8 = allNormKeys.slice(0, 8);

    const chartData = top8.map(key => ({
        topic: (candidateMap[key]?.label ?? benchNorm[key]?.label ?? key).slice(0, 18),
        Candidate: candidateMap[key]?.score ?? 0,
        Benchmark: benchNorm[key]?.score ?? 0,
    }));

    const fetchBenchmark = async (slug: string, label: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/benchmarks/${slug}`);
            if (res.ok) {
                const data = await res.json();
                setBenchmark(data.scores ?? {});
                setBenchLabel(label);
            }
        } catch { /* keep previous */ }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (!benchmarkScores) {
            fetchBenchmark(ROLE_OPTIONS[0].slug, ROLE_OPTIONS[0].label);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRoleSelect = (slug: string, label: string) => {
        setSelectedRole(slug);
        setDropdownOpen(false);
        fetchBenchmark(slug, label);
    };

    if (verifiedSkills.length === 0) return null;

    // Gap chips — where candidate trails benchmark by > 15 pts
    const gaps = chartData
        .filter(d => d.Benchmark - d.Candidate > 15)
        .sort((a, b) => (b.Benchmark - b.Candidate) - (a.Benchmark - a.Candidate))
        .slice(0, 4);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                        <Target className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-base">Skill Radar</h3>
                        <p className="text-xs text-slate-500">Your verified skills vs industry benchmark</p>
                    </div>
                </div>

                {/* Role selector */}
                <div className="relative">
                    <button
                        id="radar-role-selector"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-700 border border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50 transition-all duration-200 disabled:opacity-60"
                    >
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                        {loading ? <span className="animate-pulse text-slate-400">Loading…</span> : benchLabel}
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {dropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden">
                            {ROLE_OPTIONS.map(role => (
                                <button
                                    key={role.slug}
                                    id={`radar-role-${role.slug}`}
                                    onClick={() => handleRoleSelect(role.slug, role.label)}
                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                        selectedRole === role.slug
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

            {/* Chart — only renders client-side */}
            {!mounted ? <RadarSkeleton /> : (
                <div style={{ height: 420 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={chartData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
                            <PolarGrid stroke="#e2e8f0" gridType="polygon" />
                            <PolarAngleAxis
                                dataKey="topic"
                                tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }}
                            />
                            <Radar
                                name="Your Skills"
                                dataKey="Candidate"
                                stroke="#6366f1"
                                fill="#6366f1"
                                fillOpacity={0.2}
                                strokeWidth={2.5}
                                dot={{ fill: "#6366f1", r: 3 }}
                            />
                            <Radar
                                name={benchLabel}
                                dataKey="Benchmark"
                                stroke="#f59e0b"
                                fill="#f59e0b"
                                fillOpacity={0.1}
                                strokeWidth={2}
                                strokeDasharray="6 3"
                                dot={{ fill: "#f59e0b", r: 3 }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                wrapperStyle={{ fontSize: 13, paddingTop: 16 }}
                                formatter={(value) => (
                                    <span style={{ color: value === "Your Skills" ? "#6366f1" : "#d97706" }}>{value}</span>
                                )}
                            />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Gap chips */}
            {gaps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Skill Gaps to Close</p>
                    <div className="flex flex-wrap gap-2">
                        {gaps.map(d => (
                            <span
                                key={d.topic}
                                className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700"
                            >
                                ↑ {d.topic}: +{d.Benchmark - d.Candidate}pts needed
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
