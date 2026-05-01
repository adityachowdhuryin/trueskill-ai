"use client";

import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { Search, X, Filter, Layers, Eye, RotateCcw, Camera } from "lucide-react";
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

interface GraphVisualizerProps {
    nodes: GraphNode[];
    links: GraphLink[];
    width?: number;
    height?: number;
    onNodeClick?: (node: GraphNode) => void;
    isFullscreen?: boolean;
    showSearch?: boolean;
    graphMeta?: Record<string, unknown> | null;  // sampling metadata from backend
    repoIds?: string[];  // for Code Drill-Down from the graph panel
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

// ─── Main GraphVisualizer ──────────────────────────────────────────────────────
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
    const [codeViewerNode, setCodeViewerNode] = useState<GraphNode | null>(null);
    const bloomAdded = useRef(false);
    const hoveredNodeIdRef = useRef<string | null>(null);  // ref, not state — avoids re-renders
    const nodeObjectsRef = useRef<Record<string, THREE.Group>>({}); // store Three.js groups for direct mutation
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

        // Store reference so hover handler can mutate opacity directly (no re-render needed)
        if (n.id != null) nodeObjectsRef.current[String(n.id)] = group;

        return group;
    }, [colorMode, getNodeColor]);  // NO hoveredNodeId — hover handled via direct mutation

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

    // Node click → zoom + info panel
    const handleNodeClick = useCallback((rawNode: object) => {
        userInteracted.current = true;
        const node = rawNode as GraphNodeInternal;
        setSelectedNode(node as GraphNode);
        if (onNodeClick) onNodeClick(node as GraphNode);
        if (fgRef.current && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
            const dist = 80;
            const mag = Math.hypot(node.x, node.y, node.z) || 1;
            const ratio = 1 + dist / mag;
            fgRef.current.cameraPosition(
                { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
                node,
                1200
            );
        }
    }, [onNodeClick]);

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
        }
    }, []);

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
            </div>

            {/* ─── Legend panel ────────────────────────────────────────────── */}
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

            {/* ─── Search bar ──────────────────────────────────────────────── */}
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

            {/* ─── Code Drill-Down Modal ────────────────────────────────────── */}
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
