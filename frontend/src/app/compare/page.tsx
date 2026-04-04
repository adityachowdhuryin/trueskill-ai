"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, ArrowLeft, Users, Trophy, BarChart3, Star } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface SavedAnalysis {
    id: string;
    candidate_name: string;
    repo_names: string[];
    overall_score: number;
    created_at: string;
}

interface FullAnalysis extends SavedAnalysis {
    skills: Array<{ topic: string; score: number; status: string }>;
}

// Candidate palette for up to 3 comparisons
const CANDIDATE_COLORS = [
    { ring: "#6366f1", bg: "bg-indigo-50", text: "text-indigo-700", bar: "#6366f1", border: "border-indigo-200" },
    { ring: "#8b5cf6", bg: "bg-violet-50", text: "text-violet-700", bar: "#8b5cf6", border: "border-violet-200" },
    { ring: "#f59e0b", bg: "bg-amber-50",  text: "text-amber-700",  bar: "#f59e0b", border: "border-amber-200"  },
];

/** Small circular SVG gauge */
function ScoreGauge({ score, color, size = 96 }: { score: number; color: string; size?: number }) {
    const [animated, setAnimated] = useState(0);
    const r = (size - 10) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (animated / 100) * circ;

    useEffect(() => {
        const t = setTimeout(() => setAnimated(score), 120);
        return () => clearTimeout(t);
    }, [score]);

    return (
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
            <circle
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke={color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                className="score-ring"
                style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
            />
        </svg>
    );
}

/** Confetti burst on best-fit reveal */
function ConfettiBurst() {
    const colors = ["#6366f1", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6"];
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {colors.map((c, i) => (
                <span
                    key={i}
                    className="absolute w-2 h-2 rounded-sm"
                    style={{
                        left: `${10 + i * 10}%`,
                        top: "0%",
                        backgroundColor: c,
                        animation: `confetti-drop ${0.6 + i * 0.1}s ease-in both`,
                        animationDelay: `${i * 80}ms`,
                    }}
                />
            ))}
        </div>
    );
}

export default function ComparePage() {
    const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [compareData, setCompareData] = useState<FullAnalysis[]>([]);
    const [loading, setLoading] = useState(true);
    const [comparing, setComparing] = useState(false);
    const [bestFitShown, setBestFitShown] = useState(false);
    const [barsMounted, setBarsMounted] = useState(false);
    const barsRef = useRef(false);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/analyses`)
            .then(r => r.json())
            .then(d => setAnalyses(d.analyses || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Animate bars after compare data arrives
    useEffect(() => {
        if (compareData.length >= 2 && !barsRef.current) {
            barsRef.current = true;
            setTimeout(() => setBarsMounted(true), 200);
            setTimeout(() => setBestFitShown(true), 600);
        }
    }, [compareData]);

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else if (next.size < 3) next.add(id);
            return next;
        });
    };

    const handleCompare = useCallback(async () => {
        if (selectedIds.size < 2) return;
        setComparing(true);
        barsRef.current = false;
        setBarsMounted(false);
        setBestFitShown(false);
        try {
            const ids = Array.from(selectedIds).join(",");
            const res = await fetch(`${API_BASE_URL}/api/compare?ids=${ids}`);
            const data = await res.json();
            setCompareData(data.analyses || []);
        } catch (err) {
            console.error(err);
        } finally {
            setComparing(false);
        }
    }, [selectedIds]);

    const allSkills: string[] = Array.from(
        new Set(compareData.flatMap(a => (a.skills || []).map(s => s.topic)))
    );

    const bestFit = compareData.length >= 2
        ? compareData.reduce((best, a) => a.overall_score > best.overall_score ? a : best)
        : null;

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Animated mesh gradient background */}
            <div className="fixed inset-0 -z-10" aria-hidden="true">
                <div
                    className="absolute inset-0 animate-gradient-x"
                    style={{
                        background: "linear-gradient(135deg, #ede9fe 0%, #e0e7ff 25%, #dbeafe 50%, #f0fdf4 75%, #fdf4ff 100%)",
                        backgroundSize: "400% 400%",
                    }}
                />
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-300/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-300/20 rounded-full blur-3xl" />
            </div>

            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8 animate-slide-up">
                    <a
                        href="/dashboard"
                        className="p-2.5 bg-white/80 backdrop-blur rounded-xl shadow-sm border border-white hover:scale-110 hover:shadow-md transition-all duration-200"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </a>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Users className="w-6 h-6 text-violet-600" />
                            Candidate Comparison
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Select 2–3 saved analyses to compare side-by-side
                        </p>
                    </div>
                </div>

                {/* Saved Analyses List */}
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] mb-8 animate-slide-up overflow-hidden" style={{ animationDelay: "80ms" }}>
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h2 className="font-semibold text-slate-800">Saved Analyses</h2>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12 gap-3 text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                            <span className="text-sm">Loading analyses…</span>
                        </div>
                    ) : analyses.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50 animate-float" />
                            <p className="font-medium">No saved analyses yet</p>
                            <p className="text-sm mt-1">Run an analysis and click &quot;Save&quot; to enable comparisons</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {analyses.map((a, i) => {
                                const colorIdx = Array.from(selectedIds).indexOf(a.id);
                                const palette = colorIdx >= 0 ? CANDIDATE_COLORS[colorIdx] : null;
                                return (
                                    <label
                                        key={a.id}
                                        className={`flex items-center gap-4 px-6 py-4 cursor-pointer transition-all duration-200 hover:bg-slate-50 animate-slide-in-left ${
                                            palette ? `${palette.bg} border-l-4` : "border-l-4 border-l-transparent"
                                        }`}
                                        style={{
                                            animationDelay: `${i * 60}ms`,
                                            borderLeftColor: palette ? palette.ring : "transparent",
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            id={`analysis-${a.id}`}
                                            checked={selectedIds.has(a.id)}
                                            onChange={() => toggleSelection(a.id)}
                                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                        />
                                        <div className="flex-1">
                                            <span className="font-medium text-slate-800">{a.candidate_name}</span>
                                            <span className="ml-3 text-xs text-slate-400">{a.repo_names?.join(", ")}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-lg font-bold ${
                                                a.overall_score >= 70 ? "text-green-600" :
                                                a.overall_score >= 40 ? "text-amber-600" : "text-red-600"
                                            }`}>
                                                {a.overall_score}%
                                            </span>
                                            <div className="text-xs text-slate-400">
                                                {new Date(a.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    )}

                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center gap-4">
                        <button
                            id="compare-btn"
                            onClick={handleCompare}
                            disabled={selectedIds.size < 2 || comparing}
                            className="px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 hover:scale-105 hover:shadow-lg"
                        >
                            {comparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                            Compare Selected ({selectedIds.size})
                        </button>
                        {selectedIds.size < 2 && (
                            <p className="text-xs text-slate-400">Select at least 2 candidates</p>
                        )}
                    </div>
                </div>

                {/* Comparison Results */}
                {compareData.length >= 2 && (
                    <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] overflow-hidden animate-scale-pop">

                        {/* Score overview — gauge rings */}
                        <div className="px-6 py-5 border-b border-slate-100">
                            <h2 className="font-semibold text-slate-800 mb-5">Overall Scores</h2>
                            <div
                                className="grid gap-6"
                                style={{ gridTemplateColumns: `repeat(${compareData.length}, 1fr)` }}
                            >
                                {compareData.map((a, idx) => {
                                    const palette = CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length];
                                    return (
                                        <div
                                            key={a.id}
                                            className={`flex flex-col items-center p-5 rounded-2xl border ${palette.border} ${palette.bg} animate-slide-up hover:scale-105 transition-all duration-300`}
                                            style={{ animationDelay: `${idx * 100}ms` }}
                                        >
                                            <div className="relative mb-3">
                                                <ScoreGauge score={a.overall_score} color={palette.ring} size={100} />
                                                <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "rotate(0deg)" }}>
                                                    <AnimatedCounter
                                                        target={a.overall_score}
                                                        suffix="%"
                                                        className={`text-xl font-bold ${palette.text}`}
                                                    />
                                                </div>
                                            </div>
                                            <p className="font-semibold text-slate-800 text-center text-sm">{a.candidate_name}</p>
                                            <p className="text-xs text-slate-400 mt-0.5 text-center">{a.repo_names?.join(", ")}</p>
                                            {bestFit?.id === a.id && (
                                                <div className="mt-2 flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium animate-scale-pop">
                                                    <Star className="w-3 h-3 fill-current" /> Best Fit
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Skill-by-skill table with animated bars */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-y border-slate-100">
                                        <th className="text-left px-6 py-3 text-slate-500 font-medium">Skill</th>
                                        {compareData.map(a => (
                                            <th key={a.id} className="px-6 py-3 text-slate-500 font-medium text-center">
                                                {a.candidate_name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {allSkills.map((skill, skillIdx) => (
                                        <tr key={skill} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="px-6 py-3 font-medium text-slate-700 animate-slide-in-left" style={{ animationDelay: `${skillIdx * 40}ms` }}>
                                                {skill}
                                            </td>
                                            {compareData.map((a, candidateIdx) => {
                                                const s = (a.skills || []).find(s => s.topic === skill);
                                                const score = s?.score || 0;
                                                const palette = CANDIDATE_COLORS[candidateIdx % CANDIDATE_COLORS.length];
                                                return (
                                                    <td key={a.id} className="px-6 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                                                    style={{
                                                                        width: barsMounted ? `${score}%` : "0%",
                                                                        backgroundColor: palette.ring,
                                                                        transitionDelay: `${skillIdx * 40 + candidateIdx * 20}ms`,
                                                                        boxShadow: `0 0 6px ${palette.ring}66`,
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="font-medium text-slate-700 w-9 text-right">{score}%</span>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Best fit — with confetti */}
                        {bestFitShown && bestFit && (
                            <div className="relative px-6 py-5 border-t border-slate-100 bg-gradient-to-r from-violet-50 via-indigo-50 to-blue-50 animate-slide-up overflow-hidden">
                                <ConfettiBurst />
                                <div className="relative z-10 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shadow-inner">
                                        <Trophy className="w-5 h-5 text-amber-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Recommended Hire</p>
                                        <p className="font-bold text-slate-900 text-lg leading-tight">
                                            {bestFit.candidate_name}
                                            <span className="ml-2 text-sm font-normal text-slate-500">— Highest overall score of{" "}
                                                <AnimatedCounter target={bestFit.overall_score} suffix="%" className="font-semibold text-indigo-600" />
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
