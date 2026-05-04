"use client";

import { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, XCircle, TrendingUp } from "lucide-react";

interface Summary {
    verified: number;
    partially_verified: number;
    unverified: number;
    total_claims: number;
    average_score: number;
}

interface VerificationSummaryBarProps {
    summary: Summary;
    onFilterChange: (filter: "All" | "Verified" | "Partially Verified" | "Unverified") => void;
    activeFilter: string;
}

// ─── Animated number counter ──────────────────────────────────────────────────
function AnimCount({ target, duration = 800 }: { target: number; duration?: number }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        let start = 0;
        const step = target / (duration / 16);
        const id = setInterval(() => {
            start += step;
            if (start >= target) { setVal(target); clearInterval(id); }
            else setVal(Math.floor(start));
        }, 16);
        return () => clearInterval(id);
    }, [target, duration]);
    return <>{val}</>;
}

// ─── Premium Multi-Segment Donut ──────────────────────────────────────────────
// Uses rotate() per segment so gaps are precise and caps are perfectly rounded.
function PremiumDonut({
    verified,
    partial,
    unverified,
    total,
    avgScore,
    size = 108,
}: {
    verified: number;
    partial: number;
    unverified: number;
    total: number;
    avgScore: number;
    size?: number;
}) {
    const cx = size / 2;
    const cy = size / 2;
    const strokeW = 11;
    const r = (size - strokeW * 2) / 2;
    const circ = 2 * Math.PI * r;

    const GAP = 0.018; // 1.8% of circumference between segments as gap
    const denominator = total || 1;

    const segs = [
        { value: verified,  color: "#10b981", glow: "rgba(16,185,129,0.45)", filter: "Verified" },
        { value: partial,   color: "#f59e0b", glow: "rgba(245,158,11,0.45)", filter: "Partial" },
        { value: unverified,color: "#f43f5e", glow: "rgba(244,63,94,0.45)",  filter: "Unverified" },
    ].filter(s => s.value > 0);

    const [animated, setAnimated] = useState(false);
    useEffect(() => { const t = setTimeout(() => setAnimated(true), 100); return () => clearTimeout(t); }, []);

    let startAngle = 0; // fraction 0–1, starts at top

    const scoreColor = avgScore >= 70 ? "#10b981" : avgScore >= 40 ? "#f59e0b" : "#f43f5e";

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.10))" }}>
                {/* Track */}
                <circle
                    cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth={strokeW}
                />
                {/* Segments */}
                {segs.map((seg, i) => {
                    const pct = seg.value / denominator;
                    // Leave a small gap: subtract GAP from both ends, but only if more than 1 segment
                    const gapFraction = segs.length > 1 ? GAP : 0;
                    const dashLen = animated ? Math.max((pct - gapFraction) * circ, 0) : 0;
                    const rotateDeg = startAngle * 360 - 90; // -90 starts from 12 o'clock
                    startAngle += pct;

                    return (
                        <circle
                            key={i}
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={strokeW}
                            strokeLinecap="round"
                            strokeDasharray={`${dashLen} ${circ - dashLen}`}
                            strokeDashoffset={0}
                            transform={`rotate(${rotateDeg}, ${cx}, ${cy})`}
                            style={{
                                transition: "stroke-dasharray 900ms cubic-bezier(0.4,0,0.2,1)",
                                filter: `drop-shadow(0 0 4px ${seg.glow})`,
                            }}
                        />
                    );
                })}
            </svg>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-extrabold tabular-nums leading-none" style={{ color: scoreColor }}>
                    <AnimCount target={Math.round(avgScore)} />
                </span>
                <span className="text-[9px] font-bold text-slate-400 leading-none mt-0.5">AVG</span>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VerificationSummaryBar({
    summary,
    onFilterChange,
    activeFilter,
}: VerificationSummaryBarProps) {
    const stats = [
        {
            label: "Verified",
            value: summary.verified,
            icon: CheckCircle,
            color: "#10b981",
            bg: "rgba(16,185,129,0.06)",
            activeBg: "rgba(16,185,129,0.13)",
            border: "rgba(16,185,129,0.18)",
            activeBorder: "#10b981",
            filter: "Verified" as const,
        },
        {
            label: "Partial",
            value: summary.partially_verified,
            icon: AlertCircle,
            color: "#f59e0b",
            bg: "rgba(245,158,11,0.06)",
            activeBg: "rgba(245,158,11,0.13)",
            border: "rgba(245,158,11,0.18)",
            activeBorder: "#f59e0b",
            filter: "Partially Verified" as const,
        },
        {
            label: "Unverified",
            value: summary.unverified,
            icon: XCircle,
            color: "#f43f5e",
            bg: "rgba(244,63,94,0.06)",
            activeBg: "rgba(244,63,94,0.13)",
            border: "rgba(244,63,94,0.18)",
            activeBorder: "#f43f5e",
            filter: "Unverified" as const,
        },
    ];

    const isFiltering = activeFilter !== "All";

    return (
        <div
            className="flex-shrink-0 flex items-center gap-4 px-5 py-4 border-b border-slate-100"
            style={{ background: "linear-gradient(135deg, rgba(248,250,252,0.9) 0%, rgba(243,244,255,0.9) 100%)" }}
        >
            {/* Premium Donut */}
            <PremiumDonut
                verified={summary.verified}
                partial={summary.partially_verified}
                unverified={summary.unverified}
                total={summary.total_claims}
                avgScore={summary.average_score}
            />

            {/* Summary text beside donut */}
            <div
                className={`flex flex-col justify-center px-3 py-2 rounded-xl transition-all duration-200 min-w-[130px] ${isFiltering ? "cursor-pointer" : "cursor-default"}`}
                style={{
                    background: "rgba(99,102,241,0.07)",
                    border: `1.5px solid ${isFiltering ? "rgba(99,102,241,0.45)" : "rgba(99,102,241,0.18)"}`,
                }}
                onClick={() => { if (isFiltering) onFilterChange("All"); }}
                title={isFiltering ? "Clear filter — show all skills" : ""}
            >
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">
                    {isFiltering ? `Filtered · ${activeFilter}` : "All Skills"}
                </p>
                <p className="text-sm font-bold text-slate-700">
                    <strong className="text-indigo-600">{summary.total_claims}</strong> skill{summary.total_claims !== 1 ? "s" : ""} analyzed
                </p>
                {isFiltering ? (
                    <div className="flex items-center gap-1 mt-1.5">
                        <TrendingUp className="w-3 h-3 text-indigo-500" />
                        <span className="text-[10px] text-indigo-600 font-semibold">Clear filter</span>
                    </div>
                ) : (
                    <p className="text-[10px] text-slate-400 mt-1">Click a card to filter ↓</p>
                )}
            </div>

            {/* Divider */}
            <div className="w-px self-stretch bg-slate-200 mx-1 flex-shrink-0" />

            {/* Stat cards */}
            <div className="flex-1 grid grid-cols-3 gap-2.5 min-w-0">
                {stats.map((s) => {
                    const Icon = s.icon;
                    const isActive = activeFilter === s.filter;
                    return (
                        <button
                            key={s.label}
                            onClick={() => onFilterChange(isActive ? "All" : s.filter)}
                            className="group flex flex-col items-center justify-center gap-1 rounded-xl py-3 px-2 transition-all duration-200 text-center"
                            style={{
                                background: isActive ? s.activeBg : s.bg,
                                border: `1.5px solid ${isActive ? s.activeBorder : s.border}`,
                                boxShadow: isActive ? `0 0 0 3px ${s.color}20, 0 2px 8px ${s.color}15` : "none",
                                transform: isActive ? "scale(1.03)" : "scale(1)",
                            }}
                            title={`${isActive ? "Clear" : "Filter by"}: ${s.label}`}
                        >
                            <Icon
                                className="w-4 h-4 transition-transform duration-200 group-hover:scale-110"
                                style={{ color: s.color }}
                            />
                            <span
                                className="text-2xl font-extrabold tabular-nums leading-none"
                                style={{ color: s.color }}
                            >
                                <AnimCount target={s.value} />
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500 leading-none">{s.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
