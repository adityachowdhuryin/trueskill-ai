"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Network, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import { GraphSkeleton } from "@/components/Skeletons";
import type { GraphNode, GraphLink } from "@/components/GraphVisualizer";

// Load GraphVisualizer dynamically (it already lazy-loads ForceGraph3D internally)
const GraphVisualizer = dynamic(() => import("@/components/GraphVisualizer"), {
    ssr: false,
    loading: () => <GraphSkeleton />,
});

interface GraphFullscreenModalProps {
    nodes: GraphNode[];
    links: GraphLink[];
    onClose: () => void;
    onNodeClick?: (node: GraphNode) => void;
    isLoading?: boolean;
    graphMeta?: Record<string, unknown> | null;
}

export default function GraphFullscreenModal({
    nodes,
    links,
    onClose,
    onNodeClick,
    isLoading = false,
    graphMeta = null,
}: GraphFullscreenModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    // Close on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        // Prevent body scroll while modal is open
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [onClose]);

    // Click-outside backdrop close (only if clicking the very backdrop div)
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === overlayRef.current) onClose();
    };

    const content = (
        <div
            ref={overlayRef}
            onClick={handleBackdropClick}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(2, 6, 23, 0.85)",
                backdropFilter: "blur(6px)",
                animation: "fadeIn 0.18s ease-out",
            }}
        >
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.96); }
                    to   { opacity: 1; transform: scale(1); }
                }
            `}</style>

            {/* Modal container */}
            <div
                style={{
                    position: "relative",
                    width: "calc(100vw - 32px)",
                    height: "calc(100vh - 32px)",
                    borderRadius: 16,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    background: "radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 0 80px rgba(99,102,241,0.15), 0 32px 64px rgba(0,0,0,0.6)",
                    animation: "scaleIn 0.2s ease-out",
                }}
            >
                {/* ─── Header bar ──────────────────────────────────────────── */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 20px",
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                        background: "rgba(15,23,42,0.9)",
                        backdropFilter: "blur(12px)",
                        flexShrink: 0,
                        zIndex: 10,
                    }}
                >
                    {/* Title */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                            style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))",
                                border: "1px solid rgba(99,102,241,0.35)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                        >
                            <Network size={16} color="#a5b4fc" />
                        </div>
                        <div>
                            <h2 style={{ color: "#f1f5f9", fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>
                                Knowledge Graph
                            </h2>
                            <p style={{ color: "#475569", fontSize: 11, marginTop: 1 }}>
                                Fullscreen View — {nodes.length} nodes · {links.length} edges
                            </p>
                        </div>
                    </div>

                    {/* Right controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                            style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                background: "rgba(99,102,241,0.15)",
                                border: "1px solid rgba(99,102,241,0.3)",
                                color: "#818cf8",
                                fontSize: 11,
                                fontWeight: 500,
                            }}
                        >
                            Press <kbd style={{ fontFamily: "monospace", background: "rgba(255,255,255,0.1)", padding: "1px 4px", borderRadius: 3 }}>Esc</kbd> to exit
                        </div>

                        <button
                            onClick={onClose}
                            aria-label="Close fullscreen graph"
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "6px 12px", borderRadius: 8,
                                background: "rgba(239,68,68,0.1)",
                                border: "1px solid rgba(239,68,68,0.25)",
                                color: "#fca5a5",
                                fontSize: 12, fontWeight: 600, cursor: "pointer",
                                transition: "background 0.15s",
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.2)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.1)"; }}
                        >
                            <Minimize2 size={13} />
                            Exit Fullscreen
                        </button>

                        <button
                            onClick={onClose}
                            aria-label="Close"
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 30, height: 30, borderRadius: 7,
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                color: "#94a3b8", cursor: "pointer",
                                transition: "all 0.15s",
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#f1f5f9"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* ─── Graph canvas area ───────────────────────────────────── */}
                <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                    {isLoading ? (
                        <GraphSkeleton />
                    ) : nodes.length > 0 ? (
                        <GraphVisualizer
                            nodes={nodes}
                            links={links}
                            onNodeClick={onNodeClick}
                            isFullscreen={true}
                            showSearch={true}
                            graphMeta={graphMeta}
                        />
                    ) : (
                        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#475569" }}>
                            <Network size={48} style={{ marginBottom: 16, opacity: 0.4 }} />
                            <p style={{ fontSize: 14, fontWeight: 600 }}>No graph data available</p>
                            <p style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>Ingest a repository first</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // Only render the portal on the client
    if (typeof document === "undefined") return null;
    return createPortal(content, document.body);
}
