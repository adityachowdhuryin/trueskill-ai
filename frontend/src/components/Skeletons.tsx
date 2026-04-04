/**
 * Premium skeleton loading components with shimmer effect.
 */

// ─── Shimmer base ─────────────────────────────────────────────────────────────
function ShimmerBlock({ className }: { className: string }) {
    return <div className={`animate-shimmer rounded ${className}`} />;
}

// ─── Skill Card Skeleton ──────────────────────────────────────────────────────
export function SkillCardSkeleton() {
    return (
        <div className="rounded-xl border border-slate-200 bg-white/80 p-4 overflow-hidden">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                    <ShimmerBlock className="w-5 h-5 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <ShimmerBlock className="w-32 h-4" />
                        <ShimmerBlock className="w-52 h-3" />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ShimmerBlock className="w-12 h-12 rounded-full" />
                    <ShimmerBlock className="w-20 h-6 rounded-full" />
                </div>
            </div>
        </div>
    );
}

// ─── Graph Skeleton ───────────────────────────────────────────────────────────
export function GraphSkeleton() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 rounded-lg relative overflow-hidden">
            {/* Background shimmer */}
            <div className="absolute inset-0 animate-shimmer-dark opacity-40" />

            {/* Orbit rings */}
            <div className="relative flex items-center justify-center">
                {/* Center node */}
                <div className="w-6 h-6 rounded-full bg-indigo-500/80 z-10 relative"
                    style={{ boxShadow: "0 0 20px rgba(99,102,241,0.8)" }} />

                {/* Orbiting satellites */}
                {[
                    { color: "#3b82f6", delay: "0s",   duration: "2.5s", size: 10, distance: 45 },
                    { color: "#ef4444", delay: "0.4s",  duration: "3.2s", size: 8,  distance: 55 },
                    { color: "#22c55e", delay: "0.8s",  duration: "2.8s", size: 9,  distance: 50 },
                    { color: "#a855f7", delay: "1.2s",  duration: "2s",   size: 7,  distance: 40 },
                    { color: "#f59e0b", delay: "0.2s",  duration: "3.5s", size: 8,  distance: 60 },
                    { color: "#06b6d4", delay: "1.6s",  duration: "2.2s", size: 6,  distance: 35 },
                ].map((node, i) => (
                    <div
                        key={i}
                        className="absolute"
                        style={{
                            animation: `orbit ${node.duration} linear infinite`,
                            animationDelay: node.delay,
                            width: node.size,
                            height: node.size,
                        }}
                    >
                        <div
                            className="w-full h-full rounded-full"
                            style={{
                                backgroundColor: node.color,
                                boxShadow: `0 0 8px ${node.color}`,
                                transform: `translateX(${node.distance}px)`,
                            }}
                        />
                    </div>
                ))}
            </div>

            <p className="text-slate-400 mt-10 text-sm font-medium relative z-10">
                Loading Knowledge Graph...
            </p>
            <p className="text-slate-600 mt-1 text-xs relative z-10">
                Building node relationships
            </p>
        </div>
    );
}

// ─── Pipeline Step Skeleton (for ingestion loading) ───────────────────────────
export function PipelineStepsSkeleton({ currentStep }: { currentStep: number }) {
    const steps = [
        { label: "Cloning repository", icon: "⬇️" },
        { label: "Parsing source files", icon: "🔍" },
        { label: "Building Knowledge Graph", icon: "🕸️" },
        { label: "Ready for analysis", icon: "✅" },
    ];

    return (
        <div className="flex flex-col items-center gap-3 py-4">
            {steps.map((step, i) => (
                <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl w-full max-w-xs border transition-all duration-500 ${
                        i < currentStep
                            ? "border-emerald-200 bg-emerald-50 opacity-70"
                            : i === currentStep
                            ? "border-blue-300 bg-blue-50 shadow-sm scale-105"
                            : "border-slate-200 bg-white opacity-40"
                    }`}
                    style={{ animationDelay: `${i * 100}ms` }}
                >
                    <span className="text-base">{step.icon}</span>
                    <span className={`text-sm font-medium ${
                        i < currentStep ? "text-emerald-700" : i === currentStep ? "text-blue-700" : "text-slate-400"
                    }`}>
                        {step.label}
                    </span>
                    {i < currentStep && (
                        <span className="ml-auto text-emerald-500 text-xs font-bold">✓</span>
                    )}
                    {i === currentStep && (
                        <div className="ml-auto w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    )}
                </div>
            ))}
        </div>
    );
}
