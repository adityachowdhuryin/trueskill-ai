"use client";

// ATSSkeleton — shimmer loading skeleton that matches the ATSScorePanel layout.
// Shown while isScoring === true so users have visual feedback during the
// 10-20 second LLM call.

export default function ATSSkeleton() {
    return (
        <div
            className="rounded-2xl overflow-hidden"
            style={{
                background: "linear-gradient(160deg, #0f172a 0%, #0a0f1e 100%)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
            }}
        >
            {/* Header bar */}
            <div
                className="px-6 py-4 flex items-center justify-between"
                style={{
                    background: "linear-gradient(90deg, rgba(79,70,229,0.2) 0%, rgba(124,58,237,0.12) 100%)",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg shimmer" />
                    <div className="space-y-1.5">
                        <div className="h-3.5 w-36 rounded shimmer" />
                        <div className="h-2.5 w-48 rounded shimmer" />
                    </div>
                </div>
                <div className="h-7 w-32 rounded-lg shimmer" />
            </div>

            <div className="p-6 space-y-6">
                {/* Score dashboard */}
                <div className="flex items-center gap-8 flex-wrap">
                    {/* Circular gauge placeholder */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-[140px] h-[140px] rounded-full shimmer" />
                        <div className="h-5 w-16 rounded-full shimmer" />
                    </div>

                    {/* Score bars */}
                    <div className="flex-1 min-w-48 space-y-4">
                        {[70, 55, 85].map((w, i) => (
                            <div key={i} className="space-y-1">
                                <div className="flex justify-between">
                                    <div className="h-3 w-24 rounded shimmer" />
                                    <div className="h-3 w-8 rounded shimmer" />
                                </div>
                                <div className="h-2 rounded-full shimmer" style={{ width: `${w}%` }} />
                            </div>
                        ))}
                    </div>

                    {/* Quick stats */}
                    <div className="flex flex-col gap-3 min-w-28">
                        <div className="h-16 rounded-xl shimmer" />
                        <div className="h-16 rounded-xl shimmer" />
                    </div>
                </div>

                {/* Recommendation box */}
                <div className="h-14 rounded-xl shimmer" />

                {/* Priority actions */}
                <div className="space-y-2">
                    <div className="h-4 w-32 rounded shimmer" />
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-14 rounded-xl shimmer" />
                    ))}
                </div>

                {/* Keyword chips */}
                <div className="space-y-2">
                    <div className="h-4 w-28 rounded shimmer" />
                    <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: 14 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-6 rounded-full shimmer"
                                style={{ width: `${48 + (i % 5) * 16}px` }}
                            />
                        ))}
                    </div>
                </div>

                {/* Section bars */}
                <div className="space-y-2">
                    <div className="h-4 w-40 rounded shimmer" />
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-12 rounded-xl shimmer" />
                    ))}
                </div>
            </div>

            <style>{`
                .shimmer {
                    background: linear-gradient(
                        90deg,
                        rgba(255,255,255,0.04) 25%,
                        rgba(255,255,255,0.09) 50%,
                        rgba(255,255,255,0.04) 75%
                    );
                    background-size: 200% 100%;
                    animation: shimmerAnim 1.6s infinite linear;
                }
                @keyframes shimmerAnim {
                    0%   { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </div>
    );
}
