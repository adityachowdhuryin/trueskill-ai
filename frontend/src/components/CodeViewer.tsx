"use client";

import { useState, useEffect, useCallback } from "react";
import {
    X, Copy, Check, FileCode, Zap, Hash, ChevronRight,
    RefreshCw, AlertTriangle, Code2, Sparkles, MessageSquare,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NodeCodeData {
    source_code: string;
    name: string;
    file_path: string;
    line_start: number | null;
    line_end: number | null;
    complexity_score: number | null;
    args: string[];
    parent_class: string | null;
}

interface FunctionExplanation {
    purpose: string;
    how_it_works: string;
    complexity_note: string | null;
    watch_out_for: string | null;
    interview_angle: string | null;
}

export interface CodeViewerProps {
    nodeId: string;           // "file/path.py:FunctionName"
    repoIds: string[];        // try each until one succeeds
    fileName: string;         // display name for the file
    functionName: string;     // display name for the function
    onClose: () => void;
}

// ─── Simple syntax tokenizer ──────────────────────────────────────────────────
// Zero npm deps — inline regex tokenizer for the most common languages
const PY_KEYWORDS = new Set([
    "def","class","return","import","from","if","elif","else","for","while",
    "try","except","finally","with","as","pass","break","continue","yield",
    "async","await","lambda","not","and","or","in","is","None","True","False",
    "self","raise","assert","global","nonlocal","del","print",
]);
const JS_KEYWORDS = new Set([
    "function","const","let","var","return","if","else","for","while","do",
    "try","catch","finally","class","extends","import","export","from","new",
    "this","async","await","typeof","instanceof","null","undefined","true","false",
    "switch","case","break","continue","default","throw","yield","of","in",
]);

function detectLang(filePath: string): "python" | "js" | "other" {
    if (filePath.endsWith(".py")) return "python";
    if (/\.(js|jsx|ts|tsx)$/.test(filePath)) return "js";
    return "other";
}

function tokenizeLine(line: string, lang: "python" | "js" | "other") {
    const keywords = lang === "python" ? PY_KEYWORDS : JS_KEYWORDS;
    const parts: { text: string; color: string }[] = [];

    // Tokenize: string literals, comments, keywords, numbers, identifiers
    const regex = lang === "python"
        ? /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\n]*|\b(\w+)\b|\d+\.?\d*)/g
        : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(\w+)\b|\d+\.?\d*)/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ text: line.slice(lastIndex, match.index), color: "text-slate-300" });
        }

        const token = match[0];
        const word = match[2] || match[1];

        if (/^(#|\/\/)/.test(token) || /^\/\*/.test(token)) {
            parts.push({ text: token, color: "text-slate-500 italic" });
        } else if (/^["'`]|^"""/.test(token) || /^'''/.test(token)) {
            parts.push({ text: token, color: "text-emerald-400" });
        } else if (/^\d/.test(token)) {
            parts.push({ text: token, color: "text-amber-400" });
        } else if (word && keywords.has(word)) {
            parts.push({ text: token, color: "text-violet-400 font-semibold" });
        } else if (word && /^[A-Z]/.test(word)) {
            parts.push({ text: token, color: "text-sky-400" });
        } else {
            parts.push({ text: token, color: "text-slate-200" });
        }

        lastIndex = regex.lastIndex;
    }

    if (lastIndex < line.length) {
        parts.push({ text: line.slice(lastIndex), color: "text-slate-300" });
    }

    return parts;
}

// ─── Code panel ───────────────────────────────────────────────────────────────
function SyntaxLine({
    line, lineNum, lang,
}: {
    line: string;
    lineNum: number;
    lang: "python" | "js" | "other";
}) {
    const tokens = tokenizeLine(line, lang);
    return (
        <div className="flex group/line hover:bg-white/5 transition-colors">
            <span className="select-none w-10 flex-shrink-0 text-right pr-3 text-slate-600 text-xs leading-6 font-mono">
                {lineNum}
            </span>
            <span className="flex-1 text-xs leading-6 font-mono whitespace-pre">
                {tokens.map((t, i) => (
                    <span key={i} className={t.color}>{t.text}</span>
                ))}
            </span>
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
    return (
        <div className="p-4 space-y-2 animate-pulse">
            {[60, 80, 45, 90, 55, 70, 40].map((w, i) => (
                <div key={i} className="flex gap-3 items-center">
                    <div className="w-8 h-3 bg-slate-700 rounded flex-shrink-0" />
                    <div className="h-3 bg-slate-700 rounded" style={{ width: `${w}%` }} />
                </div>
            ))}
        </div>
    );
}

// ─── Main CodeViewer modal ─────────────────────────────────────────────────────
export default function CodeViewer({ nodeId, repoIds, fileName, functionName, onClose }: CodeViewerProps) {
    const [data, setData] = useState<NodeCodeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<"not_found" | "no_source" | "network" | null>(null);
    const [copied, setCopied] = useState(false);
    // Feature B: AI explanation tab
    const [activeTab, setActiveTab] = useState<"code" | "explain">("code");
    const [explanation, setExplanation] = useState<FunctionExplanation | null>(null);
    const [explainLoading, setExplainLoading] = useState(false);

    const fetchCode = useCallback(async () => {
        setLoading(true);
        setError(null);

        // Try each repoId until one returns code
        for (const rid of repoIds) {
            try {
                const encodedNode = encodeURIComponent(nodeId).replace(/%2F/g, "/");
                const res = await fetch(`/api/node-code/${rid}/${encodedNode}`);

                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                    setLoading(false);
                    return;
                }

                if (res.status === 404) {
                    const body = await res.json().catch(() => ({}));
                    if (body.detail === "no_source_code") {
                        setError("no_source");
                        setLoading(false);
                        return;
                    }
                    // node_not_found — try next repo_id
                    continue;
                }
            } catch {
                // network error — try next
            }
        }

        setError("not_found");
        setLoading(false);
    }, [nodeId, repoIds]);

    useEffect(() => {
        fetchCode();
    }, [fetchCode]);

    // ESC to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const handleCopy = () => {
        if (data?.source_code) {
            navigator.clipboard.writeText(data.source_code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    };

    // Feature B: fetch AI explanation (opt-in, cached in state)
    const fetchExplanation = async () => {
        if (!data || explainLoading) return;
        setExplainLoading(true);
        try {
            const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
            const res = await fetch(`${apiBase}/api/explain-function`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    source_code: data.source_code,
                    function_name: data.name,
                    file_path: data.file_path,
                    args: data.args,
                    parent_class: data.parent_class,
                    complexity_score: data.complexity_score,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const result: FunctionExplanation = await res.json();
            setExplanation(result);
        } catch {
            // silently fail — user can retry
        } finally {
            setExplainLoading(false);
        }
    };

    const handleExplainClick = () => {
        setActiveTab("explain");
        if (!explanation && !explainLoading) fetchExplanation();
    };

    const lang = data ? detectLang(data.file_path) : "other";
    const lines = (data?.source_code ?? "").split("\n");
    const startLine = data?.line_start ?? 1;

    const fileExt = data?.file_path.split(".").pop()?.toUpperCase() ?? "";
    const extColor = fileExt === "PY" ? "text-blue-400 bg-blue-900/40 border-blue-700"
        : fileExt === "TS" || fileExt === "TSX" ? "text-violet-400 bg-violet-900/40 border-violet-700"
        : fileExt === "JS" || fileExt === "JSX" ? "text-amber-400 bg-amber-900/40 border-amber-700"
        : "text-slate-400 bg-slate-800 border-slate-600";

    return (
        // Backdrop
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Modal */}
            <div
                className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                style={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.1)" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Code2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        {/* Breadcrumb: file → function */}
                        <div className="flex items-center gap-1 text-xs font-mono min-w-0">
                            <span className="text-slate-400 truncate">{fileName}</span>
                            <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
                            <span className="text-white font-semibold truncate">{functionName}</span>
                        </div>
                        {fileExt && (
                            <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${extColor}`}>
                                {fileExt}
                            </span>
                        )}
                    </div>

                    {/* Metadata pills */}
                    {data && (
                        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                            {data.line_start != null && data.line_end != null && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                                    <Hash className="w-3 h-3" />
                                    L{data.line_start}–{data.line_end}
                                </span>
                            )}
                            {data.complexity_score != null && (
                                <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/50 text-amber-400 font-mono">
                                    <Zap className="w-3 h-3" />
                                    CC {data.complexity_score}
                                </span>
                            )}
                            {data.args.length > 0 && (
                                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">
                                    ({data.args.join(", ")})
                                </span>
                            )}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {data && (
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-white/10 text-slate-300 hover:border-indigo-500/50 hover:text-white hover:bg-indigo-500/10 transition-all"
                            >
                                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Tab bar — only show when code loaded */}
                {data && !loading && !error && (
                    <div
                        className="flex items-center gap-1 px-4 py-1.5 border-b border-white/8 flex-shrink-0"
                        style={{ background: "rgba(8,12,24,0.6)" }}
                    >
                        <button
                            onClick={() => setActiveTab("code")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                            style={{
                                background: activeTab === "code" ? "rgba(99,102,241,0.2)" : "transparent",
                                color: activeTab === "code" ? "#a5b4fc" : "#64748b",
                                border: activeTab === "code" ? "1px solid rgba(99,102,241,0.35)" : "1px solid transparent",
                            }}
                        >
                            <Code2 className="w-3 h-3" />
                            Code
                        </button>
                        <button
                            onClick={handleExplainClick}
                            disabled={explainLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-60"
                            style={{
                                background: activeTab === "explain" ? "rgba(139,92,246,0.2)" : "transparent",
                                color: activeTab === "explain" ? "#c4b5fd" : "#64748b",
                                border: activeTab === "explain" ? "1px solid rgba(139,92,246,0.35)" : "1px solid transparent",
                            }}
                        >
                            <Sparkles className="w-3 h-3" />
                            {explainLoading ? "Generating…" : "Explain"}
                        </button>
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <LoadingSkeleton />
                    ) : error === "no_source" ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
                            <div className="w-12 h-12 rounded-2xl bg-amber-900/30 border border-amber-700/50 flex items-center justify-center">
                                <RefreshCw className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-200">Code not stored for this repo</p>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-sm">
                                    This repository was ingested before the Code Drill-Down feature was added.
                                    <br />Re-ingest the repo to enable source code viewing.
                                </p>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
                            <div className="w-12 h-12 rounded-2xl bg-red-900/30 border border-red-700/50 flex items-center justify-center">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-200">Node not found</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    This evidence node could not be located in the graph.
                                </p>
                            </div>
                            <button
                                onClick={fetchCode}
                                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : data ? (
                        activeTab === "code" ? (
                            <div className="py-3">
                                {lines.map((line, i) => (
                                    <SyntaxLine
                                        key={i}
                                        line={line}
                                        lineNum={startLine + i}
                                        lang={lang}
                                    />
                                ))}
                            </div>
                        ) : (
                            // Explain tab
                            <div className="p-5">
                                {explainLoading ? (
                                    // Loading skeleton
                                    <div className="space-y-4 animate-pulse">
                                        <div className="h-3 bg-violet-900/40 rounded-full w-3/4" />
                                        <div className="h-3 bg-violet-900/30 rounded-full w-full" />
                                        <div className="h-3 bg-violet-900/30 rounded-full w-5/6" />
                                        <div className="h-3 bg-violet-900/20 rounded-full w-4/5 mt-6" />
                                        <div className="h-3 bg-violet-900/20 rounded-full w-full" />
                                        <div className="h-3 bg-violet-900/20 rounded-full w-3/4" />
                                        <div className="h-3 bg-violet-900/20 rounded-full w-full" />
                                    </div>
                                ) : explanation ? (
                                    <div className="space-y-5">
                                        {/* Purpose */}
                                        <section>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[9px] font-bold uppercase tracking-widest text-violet-500">Purpose</span>
                                            </div>
                                            <p className="text-slate-200 text-sm leading-relaxed">{explanation.purpose}</p>
                                        </section>

                                        {/* How it works */}
                                        <section>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">How It Works</span>
                                            </div>
                                            <p className="text-slate-300 text-sm leading-relaxed">{explanation.how_it_works}</p>
                                        </section>

                                        {/* Complexity note */}
                                        {explanation.complexity_note && (
                                            <section className="rounded-xl p-3" style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)" }}>
                                                <div className="flex items-center gap-1.5 mb-1.5">
                                                    <Zap className="w-3 h-3 text-amber-400" />
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500">Complexity Note</span>
                                                </div>
                                                <p className="text-amber-200/80 text-xs leading-relaxed">{explanation.complexity_note}</p>
                                            </section>
                                        )}

                                        {/* Watch out for */}
                                        {explanation.watch_out_for && (
                                            <section className="rounded-xl p-3" style={{ background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)" }}>
                                                <div className="flex items-center gap-1.5 mb-1.5">
                                                    <AlertTriangle className="w-3 h-3 text-red-400" />
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">Watch Out For</span>
                                                </div>
                                                <p className="text-red-200/80 text-xs leading-relaxed">{explanation.watch_out_for}</p>
                                            </section>
                                        )}

                                        {/* Interview angle */}
                                        {explanation.interview_angle && (
                                            <section className="rounded-xl p-3" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
                                                <div className="flex items-center gap-1.5 mb-1.5">
                                                    <Sparkles className="w-3 h-3 text-indigo-400" />
                                                    <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">Interview Signal</span>
                                                </div>
                                                <p className="text-indigo-200/80 text-xs leading-relaxed">{explanation.interview_angle}</p>
                                            </section>
                                        )}

                                        {/* Regenerate */}
                                        <div className="flex justify-end pt-1">
                                            <button
                                                onClick={() => { setExplanation(null); fetchExplanation(); }}
                                                className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                                Regenerate
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    // Error / retry state
                                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                                        <Sparkles className="w-8 h-8 text-slate-600" />
                                        <p className="text-sm text-slate-400">Could not generate explanation</p>
                                        <button
                                            onClick={fetchExplanation}
                                            className="text-xs text-violet-400 hover:text-violet-300 underline"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    ) : null}
                </div>

                {/* Footer */}
                {data && (
                    <div className="flex items-center gap-3 px-4 py-2 border-t border-white/10 flex-shrink-0">
                        <FileCode className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                        <span className="text-[10px] text-slate-600 font-mono truncate flex-1">
                            {data.file_path}
                            {data.parent_class && ` · class ${data.parent_class}`}
                        </span>
                        <span className="text-[10px] text-slate-700 font-mono flex-shrink-0">
                            {lines.length} lines
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
