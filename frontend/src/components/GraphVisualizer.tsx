"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { Search, X, Filter, Layers, Eye, RotateCcw, Camera, BarChart2, GitBranch, Zap, Sparkles, RefreshCw } from "lucide-react";
import CodeViewer from "./CodeViewer";

// Dynamically import ForceGraph3D to avoid SSR issues
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-lg">
            <div className="text-slate-400">Loading 3D Graph...</div>
        </div>
    ),
});

// Node types for coloring
export type NodeType = "File" | "Class" | "Function" | "Import";

export interface GraphNode {
    id: string;
    name: string;
    type: NodeType;
    val?: number;
    color?: string;
    file_path?: string;
    complexity_score?: number;
    repo_id?: string;  // which repository this node belongs to
}

export interface GraphLink {
    source: string;
    target: string;
    type: string;
}

interface GraphSummaryData {
    summary: string;
    architecture_style: string;
    key_observations: string[];
    complexity_verdict: string;
    complexity_reasoning: string;
}

interface GraphVisualizerProps {
    nodes: GraphNode[];
    links: GraphLink[];
    width?: number;
    height?: number;
    onNodeClick?: (node: GraphNode) => void;
    isFullscreen?: boolean;
    showSearch?: boolean;
    graphMeta?: Record<string, unknown> | null;
    repoIds?: string[];
    highlightedNodeIds?: string[];              // Feature 1: evidence highlighting
    onHighlightReady?: (map: Record<string, string>) => void;  // Feature 1: name→nodeId map
    // Feature A: graph summary persisted in parent (survives tab switches)
    graphSummary?: GraphSummaryData | null;
    onGraphSummaryChange?: (summary: GraphSummaryData | null) => void;
}

// Vibrant, neon-accented color palette for node types
const NODE_COLORS: Record<NodeType, string> = {
    File: "#38bdf8",      // Sky blue
    Class: "#f472b6",     // Pink
    Function: "#4ade80",  // Lime green
    Import: "#c084fc",    // Lavender purple
};

const NODE_EMISSIVE: Record<NodeType, string> = {
    File: "#0ea5e9",
    Class: "#ec4899",
    Function: "#22c55e",
    Import: "#a855f7",
};

// Link particle/width settings per relationship
// IMPORTANT: `color` must be a Three.js-compatible string (hex/#rrggbb, rgb(), named).
// rgba() is NOT supported by THREE.Color and will crash the renderer.
// Use `cssColor` (rgba) only for HTML/CSS legend display.
const LINK_CONFIG: Record<string, { color: string; cssColor: string; width: number; particles: number; particleWidth: number }> = {
    CONTAINS:      { color: "#94a3b8", cssColor: "rgba(148,163,184,0.35)", width: 0.8,  particles: 0, particleWidth: 1 },
    CALLS:         { color: "#4ade80", cssColor: "rgba(74,222,128,0.65)",  width: 1.5,  particles: 3, particleWidth: 1.5 },
    IMPORTS:       { color: "#c084fc", cssColor: "rgba(192,132,252,0.5)",  width: 1,    particles: 2, particleWidth: 1 },
    INHERITS_FROM: { color: "#f472b6", cssColor: "rgba(244,114,182,0.7)",  width: 2.5,  particles: 4, particleWidth: 2 },
};

function getLinkConfig(type: string) {
    return LINK_CONFIG[type] ?? { color: "#64748b", cssColor: "rgba(100,116,139,0.3)", width: 1, particles: 0, particleWidth: 1 };
}

// Complexity color scale: green → yellow → orange → red
// Uses rgb() with spaces — required for correct Three.js Color parsing.
function getComplexityColor(score: number | undefined): string {
    if (score === undefined || score === null) return "#64748b";
    const clamped = Math.min(Math.max(score, 1), 15);
    const ratio = (clamped - 1) / 14;
    if (ratio < 0.33) {
        const t = ratio / 0.33;
        return `rgb(${Math.round(34 + t * 200)}, ${Math.round(197 - t * 18)}, ${Math.round(94 - t * 94)})`;
    } else if (ratio < 0.66) {
        const t = (ratio - 0.33) / 0.33;
        return `rgb(${Math.round(234 + t * 15)}, ${Math.round(179 - t * 64)}, ${Math.round(t * 22)})`;
    } else {
        const t = (ratio - 0.66) / 0.34;
        return `rgb(${Math.round(249 - t * 29)}, ${Math.round(115 - t * 77)}, ${Math.round(22 + t * 16)})`;
    }
}

type ColorMode = "type" | "complexity" | "repo";

// Generate a vivid hue from a repo_id string (deterministic)
function repoColor(repoId: string): string {
    if (!repoId) return "#64748b";
    // Hash the string to a 0-360 hue
    let hash = 0;
    for (let i = 0; i < repoId.length; i++) hash = repoId.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 75%, 60%)`;
}

// Collect unique repo_ids from a node list for the legend
function uniqueRepos(nodes: GraphNode[]): string[] {
    const seen = new Set<string>();
    nodes.forEach(n => { if (n.repo_id) seen.add(n.repo_id); });
    return Array.from(seen);
}

interface GraphNodeInternal extends GraphNode {
    x?: number;
    y?: number;
    z?: number;
    __degree?: number;
}

// ─── Node info sidebar ─────────────────────────────────────────────────────────
interface NodeInfoPanelProps {
    node: GraphNode | null;
    links: GraphLink[];
    onClose: () => void;
    onViewCode?: (node: GraphNode) => void;
}

function NodeInfoPanel({ node, links, onClose, onViewCode }: NodeInfoPanelProps) {
    if (!node) return null;

    const nodeColor = NODE_COLORS[node.type] ?? "#64748b";
    const inbound = links.filter(l => {
        const src = typeof l.source === "object" ? (l.source as GraphNodeInternal).id : l.source;
        const tgt = typeof l.target === "object" ? (l.target as GraphNodeInternal).id : l.target;
        return tgt === node.id || src === node.id;
    }).length;

    const complexityPct = node.complexity_score != null
        ? Math.min(100, ((node.complexity_score - 1) / 14) * 100)
        : null;

    return (
        <div
            className="absolute top-0 right-0 h-full w-64 z-20 flex flex-col"
            style={{
                background: "rgba(15,23,42,0.92)",
                backdropFilter: "blur(16px)",
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                animation: "slideInFromRight 0.22s ease-out forwards",
            }}
        >
            <style>{`
                @keyframes slideInFromRight {
                    from { opacity: 0; transform: translateX(24px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
            `}</style>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Node Info</span>
                <button
                    onClick={onClose}
                    className="text-slate-500 hover:text-white transition-colors"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Type badge */}
                <div>
                    <span
                        className="inline-block px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-widest"
                        style={{ background: `${nodeColor}22`, color: nodeColor, border: `1px solid ${nodeColor}55` }}
                    >
                        {node.type}
                    </span>
                </div>

                {/* Name */}
                <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Name</p>
                    <p className="text-sm font-semibold text-slate-100 break-words">{node.name}</p>
                </div>

                {/* Repo field */}
                {node.repo_id && (
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Repository</p>
                        <p className="text-xs font-semibold break-all" style={{ color: repoColor(node.repo_id) }}>
                            {node.repo_id.split("/").pop() ?? node.repo_id}
                        </p>
                        <p className="text-[10px] text-slate-600 break-all mt-0.5">{node.repo_id}</p>
                    </div>
                )}

                {/* File path */}
                {node.file_path && (
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">File</p>
                        <p className="text-xs text-slate-400 break-all">{node.file_path}</p>
                    </div>
                )}

                {/* Complexity */}
                {node.complexity_score != null && (
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Complexity</p>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold" style={{ color: getComplexityColor(node.complexity_score) }}>
                                {node.complexity_score}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${complexityPct}%`,
                                        background: `linear-gradient(to right, #4ade80, #facc15, #f97316, #ef4444)`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Connections */}
                <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Connections</p>
                    <p className="text-sm font-bold text-slate-200">{inbound}</p>
                </div>

                {/* View Source — Function nodes only */}
                {node.type === "Function" && onViewCode && (
                    <button
                        onClick={() => onViewCode(node)}
                        className="w-full flex items-center justify-center gap-2 mt-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{
                            background: "rgba(99,102,241,0.15)",
                            border: "1px solid rgba(99,102,241,0.35)",
                            color: "#a5b4fc",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.28)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(99,102,241,0.15)")}
                    >
                        <Eye size={12} />
                        View Source Code
                    </button>
                )}
            </div>
        </div>
    );
}
// ─── Graph Analytics Panel ───────────────────────────────────────────────────────────
type AnalyticsTab = "hotspots" | "hubs" | "orphans";

interface GraphAnalyticsPanelProps {
    nodes: Array<GraphNode & { __degree?: number }>;
    degreeMap: Record<string, number>;
    onFlyTo: (node: GraphNode) => void;
}

function GraphAnalyticsPanel({ nodes, degreeMap, onFlyTo }: GraphAnalyticsPanelProps) {
    const [tab, setTab] = useState<AnalyticsTab>("hotspots");

    const topComplexity = useMemo(() =>
        [...nodes]
            .filter(n => n.type === "Function" && n.complexity_score != null)
            .sort((a, b) => (b.complexity_score ?? 0) - (a.complexity_score ?? 0))
            .slice(0, 10),
    [nodes]);

    const topDegree = useMemo(() =>
        [...nodes]
            .sort((a, b) => (degreeMap[b.id] ?? 0) - (degreeMap[a.id] ?? 0))
            .slice(0, 10),
    [nodes, degreeMap]);

    // Orphans: degree 0, exclude Import nodes (terminal by design)
    const orphans = useMemo(() =>
        nodes.filter(n => n.type !== "Import" && (degreeMap[n.id] ?? 0) === 0),
    [nodes, degreeMap]);

    const TABS: [AnalyticsTab, string, string][] = [
        ["hotspots", "🔥", "Hotspots"],
        ["hubs",     "🔗", "Hubs"],
        ["orphans",  "🔴", `Orphans${orphans.length > 0 ? ` (${orphans.length})` : ""}`],
    ];

    return (
        <div
            className="absolute top-11 left-3 z-10 rounded-xl text-xs"
            style={{
                background: "rgba(15,23,42,0.93)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(16px)",
                width: 230,
                maxHeight: 380,
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Tab header */}
            <div className="flex border-b border-white/10 flex-shrink-0">
                {TABS.map(([t, emoji, label]) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className="flex-1 py-2 text-[9px] font-semibold transition-colors"
                        style={{
                            color: tab === t ? "#c7d2fe" : "#475569",
                            borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent",
                        }}
                    >
                        {emoji} {label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-2" style={{ maxHeight: 320 }}>
                {tab === "hotspots" && (
                    <>
                        <p className="text-[9px] text-slate-600 mb-2 px-1">Top functions by cyclomatic complexity</p>
                        {topComplexity.length === 0 && (
                            <p className="text-[10px] text-slate-500 px-1">No complexity data available</p>
                        )}
                        {topComplexity.map((n, i) => (
                            <button
                                key={n.id}
                                onClick={() => onFlyTo(n)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 text-left transition-colors"
                                style={{ background: "transparent" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                                <span className="text-[9px] text-slate-600 w-4 text-right shrink-0">{i + 1}</span>
                                <span className="flex-1 text-[10px] text-slate-300 truncate">{n.name}</span>
                                <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                    style={{
                                        background: `${getComplexityColor(n.complexity_score)}22`,
                                        color: getComplexityColor(n.complexity_score),
                                    }}
                                >
                                    {n.complexity_score}
                                </span>
                            </button>
                        ))}
                    </>
                )}

                {tab === "hubs" && (
                    <>
                        <p className="text-[9px] text-slate-600 mb-2 px-1">Most connected nodes by edge count</p>
                        {topDegree.map((n, i) => (
                            <button
                                key={n.id}
                                onClick={() => onFlyTo(n)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 text-left transition-colors"
                                style={{ background: "transparent" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                                <span className="text-[9px] text-slate-600 w-4 text-right shrink-0">{i + 1}</span>
                                <span
                                    className="text-[8px] font-bold px-1 py-0.5 rounded shrink-0"
                                    style={{ background: `${NODE_COLORS[n.type]}22`, color: NODE_COLORS[n.type] }}
                                >
                                    {n.type[0]}
                                </span>
                                <span className="flex-1 text-[10px] text-slate-300 truncate">{n.name}</span>
                                <span className="text-[9px] font-bold text-indigo-400 shrink-0">
                                    {degreeMap[n.id] ?? 0}
                                </span>
                            </button>
                        ))}
                    </>
                )}

                {tab === "orphans" && (
                    <>
                        <p className="text-[9px] text-slate-600 mb-2 px-1">
                            Disconnected nodes — {orphans.length === 0 ? "none found ✓" : `${orphans.length} found`}
                        </p>
                        {orphans.length === 0 && (
                            <p className="text-[10px] text-emerald-500 px-1">Graph is well-connected!</p>
                        )}
                        {orphans.slice(0, 8).map(n => (
                            <button
                                key={n.id}
                                onClick={() => onFlyTo(n)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 text-left transition-colors"
                                style={{ background: "transparent" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                                <span>{n.type === "Function" ? "🔴" : "🟡"}</span>
                                <span className="flex-1 text-[10px] text-slate-300 truncate">{n.name}</span>
                                <span className="text-[9px] text-slate-600">{n.type}</span>
                            </button>
                        ))}
                        {orphans.length > 8 && (
                            <p className="text-[9px] text-slate-500 text-center mt-1">+{orphans.length - 8} more</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Graph Summary Panel (Feature A) ──────────────────────────────────────────
const ARCH_COLORS: Record<string, string> = {
    "Monolithic": "#f472b6",
    "Pipeline": "#34d399",
    "MVC": "#818cf8",
    "Library": "#38bdf8",
    "Service": "#fb923c",
    "Data Processing": "#a78bfa",
    "ML/AI": "#fbbf24",
    "API Server": "#60a5fa",
    "CLI Tool": "#94a3b8",
    "Mixed": "#64748b",
};
const VERDICT_COLORS: Record<string, string> = {
    "Low": "#34d399",
    "Medium": "#fbbf24",
    "High": "#fb923c",
    "Very High": "#f87171",
};

interface GraphSummaryPanelProps {
    data: GraphSummaryData;
    loading: boolean;
    onRegenerate: () => void;
}

function GraphSummaryPanel({ data, loading, onRegenerate }: GraphSummaryPanelProps) {
    const archColor = ARCH_COLORS[data.architecture_style] ?? "#64748b";
    const verdictColor = VERDICT_COLORS[data.complexity_verdict] ?? "#94a3b8";

    return (
        <div
            className="absolute top-11 left-3 z-20 p-4 rounded-2xl text-xs"
            style={{
                background: "rgba(10,15,30,0.96)",
                border: "1px solid rgba(139,92,246,0.3)",
                backdropFilter: "blur(18px)",
                boxShadow: "0 0 40px rgba(139,92,246,0.08)",
                width: 310,
                maxHeight: "calc(100vh - 120px)",
                overflowY: "auto",
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Sparkles size={13} className="text-violet-400" />
                    <span className="text-[11px] font-bold text-violet-300 uppercase tracking-widest">AI Summary</span>
                </div>
                <button
                    onClick={onRegenerate}
                    disabled={loading}
                    title="Regenerate explanation"
                    className="p-1 rounded-lg text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
                    style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                >
                    <RefreshCw size={10} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Architecture style badge */}
            <div className="flex items-center gap-2 mb-3">
                <span
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                        background: `${archColor}20`,
                        border: `1px solid ${archColor}50`,
                        color: archColor,
                    }}
                >
                    {data.architecture_style}
                </span>
                <span
                    className="text-[10px] font-semibold px-2 py-1 rounded-full"
                    style={{
                        background: `${verdictColor}15`,
                        border: `1px solid ${verdictColor}40`,
                        color: verdictColor,
                    }}
                >
                    {data.complexity_verdict} Complexity
                </span>
            </div>

            {/* Summary */}
            <p className="text-slate-300 leading-relaxed mb-3" style={{ fontSize: 11 }}>
                {data.summary}
            </p>

            {/* Divider */}
            <div className="border-t border-white/5 mb-3" />

            {/* Key observations */}
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Key Observations</p>
            <ul className="space-y-1.5">
                {data.key_observations.map((obs, i) => (
                    <li key={i} className="flex gap-2 items-start">
                        <span className="text-violet-500 flex-shrink-0 mt-0.5">▸</span>
                        <span className="text-slate-400 leading-relaxed" style={{ fontSize: 10 }}>{obs}</span>
                    </li>
                ))}
            </ul>

            {/* Complexity reasoning */}
            {data.complexity_reasoning && (
                <>
                    <div className="border-t border-white/5 mt-3 mb-2" />
                    <p className="text-slate-500 italic leading-relaxed" style={{ fontSize: 10 }}>
                        {data.complexity_reasoning}
                    </p>
                </>
            )}
        </div>
    );
}

// ─── Main GraphVisualizer ──────────────────────────────────────────────

export default function GraphVisualizer({
    nodes,
    links,
    width: propWidth,
    height: propHeight,
    onNodeClick,
    isFullscreen = false,
    showSearch = true,
    graphMeta = null,
    repoIds = [],
    highlightedNodeIds = [],    // Feature 1: evidence highlight IDs (graph elementIds)
    onHighlightReady,           // Feature 1: reports name→nodeId map to parent
    graphSummary = null,        // Feature A: lifted to parent for tab-switch persistence
    onGraphSummaryChange,       // Feature A: notify parent of new summary
}: GraphVisualizerProps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [colorMode, setColorMode] = useState<ColorMode>("type");
    const [searchQuery, setSearchQuery] = useState("");
    const [hiddenTypes, setHiddenTypes] = useState<Set<NodeType>>(new Set());
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const [showLegend, setShowLegend] = useState(true);
    const [showSearchBar, setShowSearchBar] = useState(false);
    const [analyticsOpen, setAnalyticsOpen] = useState(false);  // Feature 2
    const [summaryOpen, setSummaryOpen] = useState(false);       // Feature A
    const [summaryLoading, setSummaryLoading] = useState(false); // Feature A
    const [codeViewerNode, setCodeViewerNode] = useState<GraphNode | null>(null);
    // Feature 3: path finder state machine
    const [pathMode, setPathMode] = useState<"off" | "selectStart" | "selectEnd" | "loading" | "showing">("off");
    const [pathStartNode, setPathStartNode] = useState<GraphNode | null>(null);
    const [pathEndNode, setPathEndNode] = useState<GraphNode | null>(null);
    const [pathNodeIds, setPathNodeIds] = useState<string[]>([]);
    const [pathEdgeTypes, setPathEdgeTypes] = useState<string[]>([]);
    const [pathNodes, setPathNodes] = useState<GraphNode[]>([]);
    const [pathExpanded, setPathExpanded] = useState(false);
    const bloomAdded = useRef(false);
    const hoveredNodeIdRef = useRef<string | null>(null);
    const nodeObjectsRef = useRef<Record<string, THREE.Group>>({});
    const nameToNodeIdRef = useRef<Record<string, string>>({});  // Feature 1: name→nodeId map
    const highlightedNodeIdsRef = useRef<Set<string>>(new Set()); // Feature 1
    const autoRotateRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const userInteracted = useRef(false);

    // Auto-measure container
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const updateSize = () =>
            setDimensions({ width: container.clientWidth, height: container.clientHeight });
        updateSize();
        const ro = new ResizeObserver(updateSize);
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    const graphWidth  = propWidth  || dimensions.width  || undefined;
    const graphHeight = propHeight || dimensions.height || undefined;

    // Compute degree map for node sizing
    const degreeMap = useMemo(() => {
        const map: Record<string, number> = {};
        links.forEach(l => {
            const src = typeof l.source === "object" ? (l.source as GraphNodeInternal).id : l.source;
            const tgt = typeof l.target === "object" ? (l.target as GraphNodeInternal).id : l.target;
            map[src] = (map[src] ?? 0) + 1;
            map[tgt] = (map[tgt] ?? 0) + 1;
        });
        return map;
    }, [links]);

    // Neighbor set for focus-mode highlighting
    const neighborSet = useMemo(() => {
        const map: Record<string, Set<string>> = {};
        links.forEach(l => {
            const src = typeof l.source === "object" ? (l.source as GraphNodeInternal).id ?? "" : (l.source as string);
            const tgt = typeof l.target === "object" ? (l.target as GraphNodeInternal).id ?? "" : (l.target as string);
            if (!map[src]) map[src] = new Set();
            if (!map[tgt]) map[tgt] = new Set();
            map[src].add(tgt);
            map[tgt].add(src);
        });
        return map;
    }, [links]);

    // Get color for a node
    const getNodeColor = useCallback((node: GraphNode): string => {
        if (colorMode === "complexity") return getComplexityColor(node.complexity_score);
        if (colorMode === "repo") return repoColor(node.repo_id || "");
        return NODE_COLORS[node.type] ?? "#64748b";
    }, [colorMode]);

    // Filter logic — hover focus is handled via direct Three.js mutation, NOT here
    const query = searchQuery.toLowerCase().trim();
    const graphData = useMemo(() => {
        const filteredNodes = nodes
            .filter(n => !hiddenTypes.has(n.type))
            .map(n => {
                const degree = degreeMap[n.id] ?? 1;
                const baseSize = n.type === "File" ? 10 : n.type === "Class" ? 7 : 4;
                const sizeByDegree = Math.max(baseSize, Math.min(baseSize + degree * 0.4, 20));
                const color = getNodeColor(n);
                // Only dim based on search — hover dimming is done via direct Three.js mutation
                const dimmed = query.length > 0 && !n.name.toLowerCase().includes(query);
                return { ...n, color, val: sizeByDegree, __degree: degree, __dimmed: dimmed };
            });

        const nodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = links.filter(l => {
            const src = typeof l.source === "object" ? (l.source as GraphNodeInternal).id : (l.source as string);
            const tgt = typeof l.target === "object" ? (l.target as GraphNodeInternal).id : (l.target as string);
            return nodeIds.has(src) && nodeIds.has(tgt);
        }).map(l => ({ ...l, ...getLinkConfig(l.type) }));

        return { nodes: filteredNodes, links: filteredLinks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, links, hiddenTypes, colorMode, query, degreeMap]);

    // Custom Three.js node object — stores group ref for direct hover-mutation
    const nodeThreeObject = useCallback((rawNode: object) => {
        const n = rawNode as GraphNodeInternal & { __dimmed?: boolean; val?: number };
        const color = n.color ?? getNodeColor(n);
        const emissive = colorMode === "type" ? (NODE_EMISSIVE[n.type] ?? "#64748b") : color;
        const radius = (n.val ?? 4) * 0.45;
        const opacity = n.__dimmed ? 0.06 : 1;
        const emissiveIntensity = n.__dimmed ? 0.0 : 0.7;

        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(color),
            emissive: new THREE.Color(emissive),
            emissiveIntensity,
            transparent: true,
            opacity,
        });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), mat);
        group.add(sphere);

        if (n.id != null) {
            const nid = String(n.id);
            nodeObjectsRef.current[nid] = group;
            // Feature 1: populate name→nodeId lookup for evidence highlighting
            if (n.name) nameToNodeIdRef.current[n.name] = nid;
        }
        return group;
    }, [colorMode, getNodeColor]);  // NO hover/path in deps — handled via direct mutation

    // Auto-rotate camera on load
    useEffect(() => {
        const fg = fgRef.current;
        if (!fg) return;
        let angle = 0;
        const RADIUS = 400;
        autoRotateRef.current = setInterval(() => {
            if (userInteracted.current) {
                if (autoRotateRef.current) clearInterval(autoRotateRef.current);
                return;
            }
            angle += 0.003;
            fg.cameraPosition({
                x: RADIUS * Math.sin(angle),
                y: 80,
                z: RADIUS * Math.cos(angle),
            });
        }, 16);
        return () => {
            if (autoRotateRef.current) clearInterval(autoRotateRef.current);
        };
    // re-run when graph data first loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graphData.nodes.length > 0]);

    // Hover cursor + neighborhood focus (via direct Three.js mutation — no React re-renders)
    const handleNodeHover = useCallback((node: object | null) => {
        document.body.style.cursor = node ? "pointer" : "default";
        const n = node as GraphNodeInternal | null;
        const hovId = n?.id ? String(n.id) : null;
        hoveredNodeIdRef.current = hovId;

        const objects = nodeObjectsRef.current;
        const neighbors = hovId ? (neighborSet[hovId] ?? new Set<string>()) : new Set<string>();

        Object.entries(objects).forEach(([nid, group]) => {
            const isDimmed = hovId !== null && nid !== hovId && !neighbors.has(nid);
            group.children.forEach(child => {
                const mesh = child as THREE.Mesh;
                if (mesh.material) {
                    const mat = mesh.material as THREE.MeshLambertMaterial;
                    mat.opacity = isDimmed ? 0.06 : 1;
                    mat.emissiveIntensity = isDimmed ? 0.0 : 0.7;
                    mat.needsUpdate = true;
                }
            });
        });
    }, [neighborSet]);

    // Node click — intercept for path finder, otherwise zoom + info panel
    const flyToNode = useCallback((node: GraphNode) => {
        const n = node as GraphNodeInternal;
        setSelectedNode(node);
        userInteracted.current = true;
        if (fgRef.current && n.x !== undefined && n.y !== undefined && n.z !== undefined) {
            const dist = 80;
            const mag = Math.hypot(n.x, n.y, n.z) || 1;
            const ratio = 1 + dist / mag;
            fgRef.current.cameraPosition(
                { x: n.x * ratio, y: n.y * ratio, z: n.z * ratio },
                n, 1200
            );
        }
    }, []);

    const handleNodeClick = useCallback((rawNode: object) => {
        userInteracted.current = true;
        const node = rawNode as GraphNodeInternal;

        // Feature 3: intercept clicks when path finder is active
        if (pathMode === "selectStart") {
            setPathStartNode(node as GraphNode);
            setPathMode("selectEnd");
            return;
        }
        if (pathMode === "selectEnd") {
            setPathEndNode(node as GraphNode);
            setPathMode("loading");
            return;
        }

        // Normal click
        flyToNode(node as GraphNode);
        if (onNodeClick) onNodeClick(node as GraphNode);
    }, [pathMode, flyToNode, onNodeClick]);

    // Post-physics setup: Bloom, Scene Fog, and Physics tweaks (runs once after simulation settles)
    const handleEngineStop = useCallback(() => {
        const fg = fgRef.current;
        if (!fg) return;

        // ── 1. UnrealBloom post-processing (run only once) ──
        if (!bloomAdded.current) {
            bloomAdded.current = true;
            import("three/examples/jsm/postprocessing/UnrealBloomPass.js")
                .then(({ UnrealBloomPass }) => {
                    const composer = fg.postProcessingComposer();
                    if (!composer) return;
                    const bloom = new UnrealBloomPass(
                        new THREE.Vector2(window.innerWidth, window.innerHeight),
                        1.1,   // strength — controls glow intensity
                        0.5,   // radius
                        0.08   // threshold — low = even medium-brightness nodes glow
                    );
                    composer.addPass(bloom);
                })
                .catch(() => { /* bloom unavailable, degrade gracefully */ });

            // ── 2. Scene fog for depth perception ──
            try {
                const scene = fg.scene();
                scene.fog = new THREE.FogExp2(0x020617, 0.0022);
            } catch { /* ignore */ }

            // ── 3. Physics: stronger charge repulsion ──
            try {
                const charge = fg.d3Force("charge");
                if (charge && typeof (charge as Record<string, unknown>)["strength"] === "function") {
                    (charge as { strength: (v: number) => void }).strength(-180);
                    fg.d3ReheatSimulation();
                }
            } catch { /* ignore */ }

            // ── 4. Feature 1: report name→nodeId map to parent after first settle ──
            if (onHighlightReady) {
                onHighlightReady({ ...nameToNodeIdRef.current });
            }
        }
    }, [onHighlightReady]);

    // Feature 1: apply/clear evidence highlight when highlightedNodeIds changes
    useEffect(() => {
        highlightedNodeIdsRef.current = new Set(highlightedNodeIds);
        const objects = nodeObjectsRef.current;
        const hasHighlight = highlightedNodeIds.length > 0;

        Object.entries(objects).forEach(([nid, group]) => {
            const isHighlighted = highlightedNodeIdsRef.current.has(nid);
            group.children.forEach(child => {
                const mesh = child as THREE.Mesh;
                if (mesh.material) {
                    const mat = mesh.material as THREE.MeshLambertMaterial;
                    if (isHighlighted) {
                        mat.color.set(new THREE.Color("#fbbf24"));   // amber
                        mat.emissive.set(new THREE.Color("#f59e0b"));
                        mat.emissiveIntensity = 1.2;
                        mat.opacity = 1;
                    } else if (hasHighlight) {
                        mat.opacity = 0.08;  // dim non-highlighted
                        mat.emissiveIntensity = 0;
                    } else {
                        // Clear highlight — restore defaults
                        mat.opacity = 1;
                        mat.emissiveIntensity = 0.7;
                    }
                    mat.needsUpdate = true;
                }
            });
        });

        // Zoom to fit highlighted nodes if any
        if (hasHighlight && fgRef.current) {
            const highlightSet = highlightedNodeIdsRef.current;
            try {
                fgRef.current.zoomToFit(
                    800,
                    80,
                    (node: object) => highlightSet.has(String((node as GraphNodeInternal).id ?? ""))
                );
            } catch { /* ignore if graph not ready */ }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightedNodeIds]);

    const handleNodeLabel = useCallback((rawNode: object): string => {
        const n = rawNode as GraphNode;
        const color = colorMode === "complexity"
            ? getComplexityColor(n.complexity_score)
            : colorMode === "repo"
                ? repoColor(n.repo_id || "")
                : (NODE_COLORS[n.type] ?? "#64748b");
        const repoShort = n.repo_id ? n.repo_id.split("/").pop() ?? n.repo_id : null;
        return `<div style="background:rgba(15,23,42,0.95);padding:8px 12px;border-radius:10px;font-family:Inter,sans-serif;border:1px solid rgba(255,255,255,0.1);">
  <div style="color:${color};font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase;">${n.type}</div>
  <div style="color:#f1f5f9;font-size:13px;margin-top:3px;font-weight:600;">${n.name}</div>
  ${n.file_path ? `<div style="color:#94a3b8;font-size:10px;margin-top:3px;">${n.file_path}</div>` : ""}
  ${repoShort ? `<div style="color:#818cf8;font-size:10px;margin-top:3px;">📁 ${repoShort}</div>` : ""}
  ${n.complexity_score != null ? `<div style="color:#fbbf24;font-size:10px;margin-top:3px;">Complexity: ${n.complexity_score}</div>` : ""}
</div>`;
    }, [colorMode]);

    const toggleType = (t: NodeType) => {
        setHiddenTypes(prev => {
            const next = new Set(prev);
            if (next.has(t)) next.delete(t); else next.add(t);
            return next;
        });
    };

    // Feature A: fetch AI graph summary
    const fetchGraphSummary = useCallback(async () => {
        if (summaryLoading || graphData.nodes.length === 0) return;
        setSummaryLoading(true);
        setSummaryOpen(true);

        // Build stats from client-side data (no extra API call needed)
        const typeCounts: Record<string, number> = {};
        graphData.nodes.forEach(n => {
            typeCounts[n.type] = (typeCounts[n.type] ?? 0) + 1;
        });

        const topComplex = [...graphData.nodes]
            .filter(n => n.complexity_score != null)
            .sort((a, b) => (b.complexity_score ?? 0) - (a.complexity_score ?? 0))
            .slice(0, 5)
            .map(n => ({ name: n.name, complexity_score: n.complexity_score, type: n.type }));

        const topHubs = Object.entries(degreeMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([nid, degree]) => {
                const node = graphData.nodes.find(n => String(n.id) === nid);
                return { name: node?.name ?? nid, degree, type: node?.type ?? "unknown" };
            });

        const orphanCount = graphData.nodes.filter(n =>
            (degreeMap[String(n.id)] ?? 0) === 0 &&
            ["File", "Class", "Function"].includes(n.type)
        ).length;

        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
        try {
            const res = await fetch(`${apiBase}/api/graph/explain`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repo_id: repoIds[0] ?? "unknown",
                    node_count: graphData.nodes.length,
                    edge_count: graphData.links.length,
                    type_counts: typeCounts,
                    top_complex: topComplex,
                    top_hubs: topHubs,
                    orphan_count: orphanCount,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            onGraphSummaryChange?.(data);
        } catch {
            // Keep panel open, show nothing — user can retry
        } finally {
            setSummaryLoading(false);
        }
    }, [graphData, degreeMap, repoIds, summaryLoading, onGraphSummaryChange]);


    // Feature 3: clear all path highlighting, restore materials
    const clearPath = useCallback(() => {
        setPathMode("off");
        setPathStartNode(null);
        setPathEndNode(null);
        setPathNodeIds([]);
        setPathEdgeTypes([]);
        setPathNodes([]);
        setPathExpanded(false);
        // Restore all material opacities to default
        Object.values(nodeObjectsRef.current).forEach(group => {
            group.children.forEach(child => {
                const mesh = child as THREE.Mesh;
                if (mesh.material) {
                    const mat = mesh.material as THREE.MeshLambertMaterial;
                    mat.opacity = 1;
                    mat.emissiveIntensity = 0.7;
                    mat.needsUpdate = true;
                }
            });
        });
    }, []);

    // Feature 3: fetch shortest path from backend when both nodes selected
    useEffect(() => {
        if (pathMode !== "loading" || !pathStartNode || !pathEndNode) return;
        const repoId = pathStartNode.repo_id || repoIds[0] || "";
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

        fetch(`${apiBase}/api/graph/path`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                start_id: pathStartNode.id,
                end_id: pathEndNode.id,
                repo_id: repoId,
            }),
        })
        .then(r => r.json())
        .then((data: { found: boolean; path_nodes: GraphNode[]; edge_types: string[] }) => {
            if (!data.found || !data.path_nodes?.length) {
                setPathMode("off");
                setPathStartNode(null);
                setPathEndNode(null);
                alert("No direct path found within 10 steps. These nodes may not be directly connected.");
                return;
            }
            const ids = data.path_nodes.map((n: GraphNode) => String(n.id));
            const pathSet = new Set(ids);
            setPathNodeIds(ids);
            setPathEdgeTypes(data.edge_types);
            setPathNodes(data.path_nodes);
            setPathMode("showing");

            // Apply path highlighting via direct Three.js mutation
            Object.entries(nodeObjectsRef.current).forEach(([nid, group]) => {
                const isOnPath = pathSet.has(nid);
                group.children.forEach(child => {
                    const mesh = child as THREE.Mesh;
                    if (mesh.material) {
                        const mat = mesh.material as THREE.MeshLambertMaterial;
                        if (isOnPath) {
                            mat.color.set(new THREE.Color("#fbbf24"));  // amber
                            mat.emissive.set(new THREE.Color("#f59e0b"));
                            mat.emissiveIntensity = 1.4;
                            mat.opacity = 1;
                        } else {
                            mat.opacity = 0.05;
                            mat.emissiveIntensity = 0;
                        }
                        mat.needsUpdate = true;
                    }
                });
            });

            // Zoom to path bounding box
            if (fgRef.current) {
                try {
                    fgRef.current.zoomToFit(800, 80,
                        (node: object) => pathSet.has(String((node as GraphNodeInternal).id ?? "")));
                } catch { /* ignore */ }
            }
        })
        .catch(() => {
            setPathMode("off");
            setPathStartNode(null);
            setPathEndNode(null);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathMode]);

    const activeNodeTypes = (Object.keys(NODE_COLORS) as NodeType[]);


    return (
        <div
            ref={containerRef}
            className="w-full h-full relative overflow-hidden"
            style={{ background: "radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)" }}
            onPointerDown={() => { userInteracted.current = true; }}
        >
            {/* ─── Top toolbar ─────────────────────────────────────────────── */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
                {/* Legend toggle */}
                <button
                    onClick={() => setShowLegend(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                        background: showLegend ? "rgba(99,102,241,0.25)" : "rgba(30,41,59,0.85)",
                        border: showLegend ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
                        color: showLegend ? "#a5b4fc" : "#94a3b8",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <Layers size={12} />
                    Legend
                </button>

                {/* Color mode pills */}
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(15,23,42,0.8)", backdropFilter: "blur(12px)" }}>
                    {(["type", "complexity", "repo"] as ColorMode[]).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setColorMode(mode)}
                            className="px-2.5 py-1.5 text-[11px] font-semibold capitalize transition-all"
                            style={{
                                background: colorMode === mode ? "rgba(99,102,241,0.4)" : "transparent",
                                color: colorMode === mode ? "#c7d2fe" : "#64748b",
                            }}
                        >
                            {mode === "type" ? "Type" : mode === "complexity" ? "Complexity" : "Repo"}
                        </button>
                    ))}
                </div>

                {/* Search toggle */}
                {showSearch && (
                    <button
                        onClick={() => { setShowSearchBar(v => !v); if (showSearchBar) setSearchQuery(""); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                        style={{
                            background: showSearchBar ? "rgba(99,102,241,0.25)" : "rgba(30,41,59,0.85)",
                            border: showSearchBar ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
                            color: showSearchBar ? "#a5b4fc" : "#94a3b8",
                            backdropFilter: "blur(12px)",
                        }}
                    >
                        <Search size={12} />
                        Search
                    </button>
                )}

                {/* Reset Camera */}
                <button
                    onClick={() => {
                        userInteracted.current = false;
                        fgRef.current?.zoomToFit(600, 80);
                    }}
                    title="Reset camera to overview"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                        background: "rgba(30,41,59,0.85)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#94a3b8",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <RotateCcw size={12} />
                    Reset
                </button>

                {/* Export PNG */}
                <button
                    onClick={() => {
                        const renderer = fgRef.current?.renderer();
                        if (!renderer) return;
                        const url = renderer.domElement.toDataURL("image/png");
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "knowledge-graph.png";
                        a.click();
                    }}
                    title="Download graph as PNG"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                        background: "rgba(30,41,59,0.85)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#94a3b8",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <Camera size={12} />
                    Export
                </button>

                {/* Analytics toggle — Feature 2 */}
                <button
                    onClick={() => { setAnalyticsOpen(v => !v); if (showLegend) setShowLegend(false); }}
                    title="Graph analytics"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                        background: analyticsOpen ? "rgba(99,102,241,0.25)" : "rgba(30,41,59,0.85)",
                        border: analyticsOpen ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
                        color: analyticsOpen ? "#a5b4fc" : "#94a3b8",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <BarChart2 size={12} />
                    Analytics
                </button>

                {/* Path Finder toggle — Feature 3 */}
                <button
                    onClick={() => {
                        if (pathMode === "off") { setPathMode("selectStart"); setSelectedNode(null); }
                        else clearPath();
                    }}
                    title="Find shortest path between two nodes"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                        background: pathMode !== "off" ? "rgba(251,191,36,0.2)" : "rgba(30,41,59,0.85)",
                        border: pathMode !== "off" ? "1px solid rgba(251,191,36,0.5)" : "1px solid rgba(255,255,255,0.08)",
                        color: pathMode !== "off" ? "#fbbf24" : "#94a3b8",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <GitBranch size={12} />
                    {pathMode === "off" ? "Path" : pathMode === "selectStart" ? "Pick Start…" : pathMode === "selectEnd" ? "Pick End…" : pathMode === "loading" ? "Finding…" : "Clear Path"}
                </button>

                {/* AI Explain toggle — Feature A */}
                <button
                    onClick={() => {
                        if (!graphSummary && !summaryLoading) { fetchGraphSummary(); }
                        else { setSummaryOpen(v => !v); }
                    }}
                    disabled={summaryLoading}
                    title="AI architectural summary of this codebase"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-70"
                    style={{
                        background: summaryOpen ? "rgba(139,92,246,0.25)" : "rgba(30,41,59,0.85)",
                        border: summaryOpen ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                        color: summaryOpen ? "#c4b5fd" : "#94a3b8",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <Sparkles size={12} />
                    {summaryLoading ? "Generating…" : "Explain"}
                </button>
            </div>

            {/* Analytics Panel — Feature 2 */}
            {analyticsOpen && !showLegend && (
                <GraphAnalyticsPanel
                    nodes={graphData.nodes}
                    degreeMap={degreeMap}
                    onFlyTo={flyToNode}
                />
            )}

            {/* AI Summary Panel — Feature A */}
            {summaryOpen && !showLegend && !analyticsOpen && (
                graphSummary ? (
                    <GraphSummaryPanel
                        data={graphSummary}
                        loading={summaryLoading}
                        onRegenerate={() => { onGraphSummaryChange?.(null); fetchGraphSummary(); }}
                    />
                ) : summaryLoading ? (
                    // Loading skeleton
                    <div
                        className="absolute top-11 left-3 z-20 p-4 rounded-2xl"
                        style={{
                            background: "rgba(10,15,30,0.96)",
                            border: "1px solid rgba(139,92,246,0.25)",
                            backdropFilter: "blur(18px)",
                            width: 310,
                        }}
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <Sparkles size={13} className="text-violet-400 animate-pulse" />
                            <span className="text-[11px] font-bold text-violet-300 uppercase tracking-widest">Analyzing codebase…</span>
                        </div>
                        {[80, 60, 90, 45, 70].map((w, i) => (
                            <div key={i} className="h-2.5 rounded-full mb-3 animate-pulse" style={{ width: `${w}%`, background: "rgba(139,92,246,0.2)" }} />
                        ))}
                    </div>
                ) : null
            )}

            {/* Path Finder status overlay — Feature 3 */}
            {(pathMode === "selectStart" || pathMode === "selectEnd" || pathMode === "loading") && (
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-6 py-4 rounded-xl text-sm font-semibold pointer-events-none"
                    style={{
                        background: "rgba(15,23,42,0.93)",
                        border: "1px solid rgba(251,191,36,0.4)",
                        backdropFilter: "blur(16px)",
                        color: "#fbbf24",
                        boxShadow: "0 0 40px rgba(251,191,36,0.12)",
                        textAlign: "center",
                    }}
                >
                    {pathMode === "selectStart" && <><GitBranch size={16} style={{ display: "inline", marginRight: 8 }} />Click a <strong>start</strong> node</>}
                    {pathMode === "selectEnd" && <><Zap size={16} style={{ display: "inline", marginRight: 8 }} />Now click an <strong>end</strong> node<br /><span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>From: {pathStartNode?.name}</span></>}
                    {pathMode === "loading" && <>⏳ Finding shortest path…</>}
                </div>
            )}

            {/* Legend panel */}
            {showLegend && (

                <div
                    className="absolute top-11 left-3 z-10 p-3 rounded-xl text-xs space-y-2"
                    style={{ background: "rgba(15,23,42,0.88)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", minWidth: 140 }}
                >
                    {colorMode === "type" ? (
                        <>
                            <p className="font-semibold text-slate-300 text-[10px] uppercase tracking-widest mb-1">Node Types</p>
                            {activeNodeTypes.map(type => (
                                <button
                                    key={type}
                                    onClick={() => toggleType(type)}
                                    className="flex items-center gap-2 w-full text-left group"
                                >
                                    <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform group-hover:scale-125"
                                        style={{
                                            backgroundColor: NODE_COLORS[type],
                                            opacity: hiddenTypes.has(type) ? 0.2 : 1,
                                            boxShadow: hiddenTypes.has(type) ? "none" : `0 0 6px ${NODE_COLORS[type]}`,
                                        }}
                                    />
                                    <span
                                        className="transition-colors"
                                        style={{ color: hiddenTypes.has(type) ? "#475569" : "#cbd5e1" }}
                                    >
                                        {type}
                                    </span>
                                    {hiddenTypes.has(type) && (
                                        <span className="ml-auto text-[8px] text-slate-600 uppercase">hidden</span>
                                    )}
                                </button>
                            ))}
                            <p className="text-[9px] text-slate-600 mt-1">Click to toggle</p>
                        </>
                    ) : colorMode === "repo" ? (
                        <>
                            <p className="font-semibold text-slate-300 text-[10px] uppercase tracking-widest mb-2">Repositories</p>
                            {uniqueRepos(nodes).map(rid => {
                                const short = rid.split("/").pop() ?? rid;
                                const c = repoColor(rid);
                                return (
                                    <div key={rid} className="flex items-center gap-2 mb-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c, boxShadow: `0 0 6px ${c}` }} />
                                        <span className="text-[10px] text-slate-300 truncate" title={rid}>{short}</span>
                                    </div>
                                );
                            })}
                            {uniqueRepos(nodes).length === 0 && <p className="text-[9px] text-slate-600">No repo info on nodes</p>}
                        </>
                    ) : (
                        <>
                            <p className="font-semibold text-slate-300 text-[10px] uppercase tracking-widest mb-1">Complexity</p>
                            <div className="w-full h-2.5 rounded-full" style={{ background: "linear-gradient(to right, #4ade80, #facc15, #f97316, #ef4444)" }} />
                            <div className="flex justify-between text-[9px] text-slate-500">
                                <span>Low (1)</span>
                                <span>High (15)</span>
                            </div>
                        </>
                    )}

                    {/* Link legend */}
                    <div className="pt-2 border-t border-white/5">
                        <p className="font-semibold text-slate-300 text-[10px] uppercase tracking-widest mb-1.5">Relationships</p>
                        {Object.entries(LINK_CONFIG).map(([type, cfg]) => (
                            <div key={type} className="flex items-center gap-2 mb-1">
                                <span className="w-5 h-0.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                                <span className="text-[9px] text-slate-500">{type}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showSearchBar && (
                <div
                    className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2"
                    style={{ width: isFullscreen ? 360 : 280 }}
                >
                    <div
                        className="flex items-center flex-1 gap-2 px-3 py-2 rounded-xl"
                        style={{ background: "rgba(15,23,42,0.90)", border: "1px solid rgba(99,102,241,0.4)", backdropFilter: "blur(16px)" }}
                    >
                        <Search size={13} className="text-indigo-400 flex-shrink-0" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search nodes…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 outline-none"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")} className="text-slate-500 hover:text-white">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Type filter chips (shown when search active) */}
            {showSearchBar && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
                    <Filter size={10} className="text-slate-600" />
                    {activeNodeTypes.map(type => (
                        <button
                            key={type}
                            onClick={() => toggleType(type)}
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all"
                            style={{
                                background: hiddenTypes.has(type) ? "rgba(30,41,59,0.8)" : `${NODE_COLORS[type]}22`,
                                border: `1px solid ${hiddenTypes.has(type) ? "rgba(255,255,255,0.06)" : `${NODE_COLORS[type]}66`}`,
                                color: hiddenTypes.has(type) ? "#475569" : NODE_COLORS[type],
                            }}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            )}

            {/* ─── 3D Graph Canvas ─────────────────────────────────────────── */}
            <ForceGraph3D
                ref={fgRef}
                graphData={graphData}
                width={graphWidth}
                height={graphHeight}
                backgroundColor="#020617"
                nodeThreeObject={nodeThreeObject}
                nodeThreeObjectExtend={false}
                nodeLabel={handleNodeLabel}
                nodeOpacity={1}
                linkColor={(link: object) => (link as { color: string }).color}
                linkWidth={(link: object) => (link as { width: number }).width ?? 1}
                linkOpacity={0.65}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                linkDirectionalArrowColor={(link: object) => (link as { color: string }).color}
                linkDirectionalParticles={(link: object) => (link as { particles: number }).particles ?? 0}
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalParticleWidth={(link: object) => (link as { particleWidth: number }).particleWidth ?? 1}
                linkDirectionalParticleColor={(link: object) => (link as { color: string }).color}
                onNodeHover={handleNodeHover}
                onNodeClick={handleNodeClick}
                onEngineStop={handleEngineStop}
                enableNodeDrag={true}
                enableNavigationControls={true}
                showNavInfo={false}
            />

            {/* ─── Node Info Sidebar ─────────────────────────────────────────── */}
            <NodeInfoPanel
                node={selectedNode}
                links={links}
                onClose={() => setSelectedNode(null)}
                onViewCode={(n) => setCodeViewerNode(n)}
            />

            {/* ─── Sampling indicator banner ────────────────────────────── */}
            {graphMeta?.was_sampled && (
                <div
                    className="absolute top-3 right-4 z-10 text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-2"
                    style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)", backdropFilter: "blur(8px)" }}
                    title={`Repository has ${graphMeta.total_nodes as number} nodes total. Top ${graphMeta.returned_nodes as number} shown, prioritised by complexity score.`}
                >
                    <span style={{ color: "#fb923c" }}>⚡</span>
                    <span style={{ color: "#fed7aa" }}>
                        Showing{" "}
                        <span className="font-bold" style={{ color: "#fb923c" }}>{graphMeta.returned_nodes as number}</span>
                        {" "}of{" "}
                        <span className="font-bold" style={{ color: "#fb923c" }}>{graphMeta.total_nodes as number}</span>
                        {" "}nodes
                        <span className="opacity-60 ml-1">(sampled by complexity)</span>
                    </span>
                </div>
            )}

            {/* ─── Bottom hint ─────────────────────────────────────────────── */}
            <div
                className="absolute bottom-3 right-4 z-10 text-[11px] text-slate-500 px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(15,23,42,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
                🖱 Drag · Scroll · Click node
            </div>

            {/* ─── Stats badge ─────────────────────────────────────────── */}
            <div
                className="absolute bottom-3 left-3 z-10 flex items-center gap-3 text-[11px] px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(15,23,42,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
                <span className="text-slate-400"><span className="font-bold text-slate-200">{graphData.nodes.length}</span> nodes</span>
                <span className="w-px h-3 bg-white/10" />
                <span className="text-slate-400"><span className="font-bold text-slate-200">{graphData.links.length}</span> edges</span>
            </div>
            {/* Path breadcrumb bar — Feature 3 */}
            {pathMode === "showing" && pathNodes.length > 0 && (
                <div
                    className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 px-4 py-3 rounded-2xl flex items-center gap-1.5 flex-wrap justify-center"
                    style={{
                        background: "rgba(15,23,42,0.95)",
                        border: "1px solid rgba(251,191,36,0.35)",
                        backdropFilter: "blur(16px)",
                        maxWidth: "90%",
                        boxShadow: "0 0 30px rgba(251,191,36,0.1)",
                    }}
                >
                    <span className="text-[9px] text-amber-500 font-bold uppercase tracking-widest mr-1">Path</span>
                    {(() => {
                        const COLLAPSE_THRESHOLD = 7;
                        const show = pathNodes.length <= COLLAPSE_THRESHOLD || pathExpanded
                            ? pathNodes
                            : [...pathNodes.slice(0, 2), null, ...pathNodes.slice(-2)];
                        return show.map((n, i) => n === null ? (
                            <button
                                key="ellipsis"
                                onClick={() => setPathExpanded(true)}
                                className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
                            >
                                +{pathNodes.length - 4} more
                            </button>
                        ) : (
                            <span key={n.id} className="flex items-center gap-1">
                                <button
                                    onClick={() => flyToNode(n)}
                                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all"
                                    style={{ background: "rgba(251,191,36,0.15)", color: "#fef3c7", border: "1px solid rgba(251,191,36,0.35)" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(251,191,36,0.3)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(251,191,36,0.15)")}
                                >
                                    {n.name}
                                </button>
                                {i < show.length - 1 && show[i + 1] !== null && (
                                    <span className="text-[9px] text-slate-600">
                                        {pathEdgeTypes[i] ?? "→"}
                                    </span>
                                )}
                                {show[i + 1] === null && <span className="text-[9px] text-slate-600">→</span>}
                            </span>
                        ));
                    })()}
                    <button
                        onClick={clearPath}
                        className="ml-2 text-[9px] px-2 py-0.5 rounded-full text-slate-500 hover:text-slate-300 transition-colors"
                        style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        ✕ Clear
                    </button>
                </div>
            )}


            {codeViewerNode && (
                <CodeViewer
                    nodeId={codeViewerNode.file_path
                        ? `${codeViewerNode.file_path}:${codeViewerNode.name}`
                        : String(codeViewerNode.id ?? codeViewerNode.name)}
                    repoIds={repoIds.length > 0 ? repoIds : (codeViewerNode.repo_id ? [codeViewerNode.repo_id] : [])}
                    fileName={codeViewerNode.file_path?.split("/").pop() ?? codeViewerNode.name}
                    functionName={codeViewerNode.name}
                    onClose={() => setCodeViewerNode(null)}
                />
            )}
        </div>
    );
}
