"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
    Upload, FileText, Loader2, CheckCircle, XCircle, AlertCircle,
    Github, Network, List, Sparkles, BookOpen, Clock, Target, ChevronRight,
    ShieldCheck, ShieldAlert, ShieldX, Star, Download, Save, Link2, Maximize2, FileSearch,
    Terminal, ArrowLeft, RotateCcw, Play, CheckSquare, Square
} from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import SkillCard from "@/components/SkillCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SkillCardSkeleton, GraphSkeleton } from "@/components/Skeletons";
import SkillTimeline from "@/components/SkillTimeline";
import type { GraphNode, GraphLink } from "@/components/GraphVisualizer";

// Dynamically import GraphVisualizer to avoid SSR issues with Three.js
const GraphVisualizer = dynamic(() => import("@/components/GraphVisualizer"), {
    ssr: false,
    loading: () => <GraphSkeleton />,
});

// Dynamically import GraphFullscreenModal (uses React Portal)
const GraphFullscreenModal = dynamic(() => import("@/components/GraphFullscreenModal"), {
    ssr: false,
});

// Dynamically import ATSScorePanel
const ATSScorePanel = dynamic(() => import("@/components/ATSScorePanel"), { ssr: false });

// ATSReport type (mirrors backend ATSReport Pydantic model)
interface ATSReport {
    ats_score: number;
    keyword_match_score: number;
    format_score: number;
    content_score: number;
    keyword_matches: Array<{ keyword: string; found: boolean; context: string }>;
    section_feedback: Array<{ section: string; score: number; feedback: string; suggestions: string[] }>;
    top_missing_keywords: string[];
    formatting_flags: string[];
    overall_recommendation: string;
    strengths: string[];
    improvements: string[];
}

// Types matching backend response
interface GitHubRepo {
    name: string;
    html_url: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    updated_at: string;
}

interface VerificationResult {
    claim_id: string;
    topic: string;
    claim_text: string;
    status: "Verified" | "Partially Verified" | "Unverified";
    score: number;
    evidence_node_ids: string[];
    reasoning: string;
    complexity_analysis: string;
}

interface ForensicsData {
    authenticity_score: number;
    consistency_score: number;
    verdict: string;
    files_analyzed: number;
    files_with_issues: number;
    warnings: string[];
    has_bulk_commits: boolean;
    suspicious_files: Array<{
        path: string;
        entropy: number;
        dominant_style: string;
        flags: string[];
    }>;
}

interface AnalysisResponse {
    status: string;
    repo_id: string;
    claims_extracted: number;
    claims: Array<{
        id: string;
        topic: string;
        claim_text: string;
        difficulty: number;
    }>;
    verification_results: VerificationResult[];
    summary: {
        verified: number;
        partially_verified: number;
        unverified: number;
        total_claims: number;
        average_score: number;
    };
    errors: string[];
    authenticity_score?: number | null;
    forensics?: ForensicsData;
}

interface BridgeProject {
    rank: number;
    gap_skill: string;
    project_title: string;
    description: string;
    tech_stack: string[];
    difficulty: string;
    estimated_time: string;
    steps: string[];
    learning_outcomes: string[];
    analysis: string;
    why_this_gap: string;
    estimated_score_gain: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type ViewMode = "cards" | "graph";

/** Ingestion step-progress loader */
const INGEST_STEPS = ["Cloning Repository", "Parsing Code", "Building Graph", "Indexing"];

function IngestionLoader({ active }: { active: boolean }) {
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (!active) { setStep(0); return; }
        setStep(0);
        const id = setInterval(() => setStep(s => (s < INGEST_STEPS.length - 1 ? s + 1 : s)), 2500);
        return () => clearInterval(id);
    }, [active]);
    if (!active) return null;
    return (
        <div className="flex flex-col items-center justify-center gap-6 p-10 h-full text-center">
            <div className="relative">
                <div className="absolute inset-0 rounded-full bg-indigo-400/20 blur-xl animate-pulse" />
                <div className="w-16 h-16 rounded-full bg-white border-2 border-indigo-100 shadow-lg flex items-center justify-center relative z-10">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
            </div>
            <div className="space-y-3 w-full max-w-xs">
                {INGEST_STEPS.map((s, i) => (
                    <div key={s} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-500 ${
                        i < step ? "bg-emerald-50 border border-emerald-200" :
                        i === step ? "bg-indigo-50 border border-indigo-200 animate-pulse" :
                        "bg-slate-50 border border-slate-100 opacity-40"
                    }`} style={{ animationDelay: `${i * 80}ms` }}>
                        {i < step ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 animate-scale-pop" />
                        ) : i === step ? (
                            <Loader2 className="w-4 h-4 text-indigo-500 flex-shrink-0 animate-spin" />
                        ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                        )}
                        <span className={`text-sm font-medium ${
                            i < step ? "text-emerald-700" : i === step ? "text-indigo-700" : "text-slate-400"
                        }`}>{s}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Terminal-style streaming agent status */
function AgentTerminal({ messages, current }: { messages: string[]; current: string | null }) {
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    return (
        <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 font-mono text-xs max-h-40 overflow-y-auto shadow-inner">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-700 pb-2">
                <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <Terminal className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400 text-[10px]">trueskill-agent</span>
            </div>
            {messages.map((msg, i) => (
                <div key={i} className="text-emerald-400 mb-1 animate-fade-in">
                    <span className="text-slate-500 mr-2">$</span>{msg}
                </div>
            ))}
            {current && (
                <div className="text-cyan-400 flex items-center gap-1">
                    <span className="text-slate-500 mr-2">$</span>
                    {current}
                    <span className="inline-block w-1.5 h-3 bg-cyan-400 animate-blink ml-0.5" />
                </div>
            )}
            <div ref={bottomRef} />
        </div>
    );
}

export default function DashboardPage() {
    const [repoUrl, setRepoUrl] = useState("");
    const [repoId, setRepoId] = useState<string | null>(null);
    const [agentStatus, setAgentStatus] = useState<string | null>(null);
    const [agentMessages, setAgentMessages] = useState<string[]>([]);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfFileName, setPdfFileName] = useState<string | null>(null); // persisted across navigations
    const [isIngesting, setIsIngesting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("cards");
    const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    // graphRepoId tracks which repo_id to use for the graph — can be 'all' for multi-repo
    // it is separate from repoId so the useEffect doesn't overwrite the multi-repo graph call
    const [graphRepoId, setGraphRepoId] = useState<string | null>(null);

    const [coachFocused, setCoachFocused] = useState(false);

    // Auto-detect extraction state
    const [extractedRepos, setExtractedRepos] = useState<GitHubRepo[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [githubUsername, setGithubUsername] = useState<string | null>(null);
    const [extractionError, setExtractionError] = useState<string | null>(null);
    const [isManualMode, setIsManualMode] = useState(false);

    // Graph data state (Improvement #4 — real data from API)
    const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
    const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
    const [isLoadingGraph, setIsLoadingGraph] = useState(false);

    // Coach state
    const [jobDescription, setJobDescription] = useState("");
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [bridgeProjects, setBridgeProjects] = useState<BridgeProject[]>([]);
    const [gapSummary, setGapSummary] = useState<string | null>(null);
    const [activeBridgeTab, setActiveBridgeTab] = useState(0);
    const [showAllSteps, setShowAllSteps] = useState(false);
    const [numProjects, setNumProjects] = useState(3);
    const [coachError, setCoachError] = useState<string | null>(null);

    // ATS Score state
    const [atsReport, setAtsReport] = useState<ATSReport | null>(null);
    const [isScoring, setIsScoring] = useState(false);
    const [atsError, setAtsError] = useState<string | null>(null);

    // Timeline state (Feature 8)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [timelineData, setTimelineData] = useState<Record<string, any[]>>({});

    // Multi-repo state (Feature 2)
    const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
    const [multiRepoIds, setMultiRepoIds] = useState<string[]>([]);

    // LinkedIn state (Feature 9)
    const [linkedinUrl, setLinkedinUrl] = useState("");

    // Save/Export state (Features 4 & 5)
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Fetch real graph data when repo is ingested (Improvement #4)
    const fetchGraphData = useCallback(async (rid: string) => {
        setIsLoadingGraph(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/graph/${rid}`);
            if (!response.ok) throw new Error("Failed to fetch graph data");
            const data = await response.json();

            const nodes: GraphNode[] = (data.nodes || []).map((n: Record<string, unknown>) => ({
                id: n.id as string,
                name: n.name as string,
                type: (n.type as GraphNode["type"]) || "File",
                file_path: n.file_path as string | undefined,
                complexity_score: n.complexity_score as number | undefined,
                repo_id: (n.repo_id as string) || "",
            }));

            const links: GraphLink[] = (data.edges || []).map((e: Record<string, unknown>) => ({
                source: e.source as string,
                target: e.target as string,
                type: e.type as string,
            }));

            setGraphNodes(nodes);
            setGraphLinks(links);
        } catch (err) {
            console.error("Graph fetch error:", err);
        } finally {
            setIsLoadingGraph(false);
        }
    }, []);

    // Auto-fetch graph data and timeline when graphRepoId changes
    // graphRepoId can be a single repo_id OR 'all' for multi-repo combined view
    useEffect(() => {
        if (graphRepoId) {
            fetchGraphData(graphRepoId);
        }
        // Also fetch timeline using the primary repoId (timeline is always per-repo)
        if (repoId) {
            fetch(`${API_BASE_URL}/api/skill-timeline/${repoId}`)
                .then(r => r.json())
                .then(d => setTimelineData(d.timeline || {}))
                .catch(() => setTimelineData({}));
        }
    }, [graphRepoId, repoId, fetchGraphData]);

    // Export report handler (Feature 5)
    const handleExportReport = useCallback(async () => {
        if (!analysisResult) return;
        try {
            const repoNames = extractedRepos.filter(r => selectedRepos.has(r.html_url)).map(r => r.name);
            const response = await fetch(`${API_BASE_URL}/api/export-report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidate_name: githubUsername || "Candidate",
                    repo_names: repoNames.length ? repoNames : (analysisResult.repo_id ? [analysisResult.repo_id] : ["Unknown"]),
                    skills: analysisResult.verification_results?.map(v => ({
                        topic: v.topic,
                        score: v.score,
                        status: v.status,
                        evidence: v.reasoning,
                        complexity_analysis: v.complexity_analysis,
                    })) || [],
                    overall_score: analysisResult.summary?.average_score || 0,
                    verification_results: analysisResult.verification_results || [],
                    forensics: analysisResult.forensics || null,
                    bridge_projects: bridgeProjects || [],
                    ats_report: atsReport || null,
                    summary: analysisResult.summary || null,
                }),
            });
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const date = new Date().toISOString().split("T")[0];
            a.download = `trueskill_report_${(githubUsername || "candidate").replace(/\s+/g, "_")}_${date}.html`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Export failed:", err);
        }
    }, [analysisResult, githubUsername, extractedRepos, selectedRepos, bridgeProjects, atsReport]);


    // Save analysis handler (Feature 4)
    const handleSaveAnalysis = useCallback(async () => {
        if (!analysisResult) return;
        setIsSaving(true);
        try {
            await fetch(`${API_BASE_URL}/api/analyses`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidate_name: githubUsername || "Candidate",
                    repo_names: extractedRepos.filter(r => selectedRepos.has(r.html_url)).map(r => r.name),
                    repo_ids: multiRepoIds,
                    results: analysisResult,
                    skills: analysisResult.verification_results?.map(v => ({ topic: v.topic, score: v.score, status: v.status, evidence: v.reasoning })) || [],
                    overall_score: analysisResult.summary?.average_score || 0,
                }),
            });
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            console.error("Save failed:", err);
        } finally {
            setIsSaving(false);
        }
    }, [analysisResult, githubUsername, extractedRepos, selectedRepos, multiRepoIds]);

    // Toggle repo selection for multi-repo
    const toggleRepoSelection = useCallback((url: string) => {
        setSelectedRepos(prev => {
            const next = new Set(prev);
            if (next.has(url)) {
                next.delete(url);
            } else {
                next.add(url);
            }
            return next;
        });
    }, []);

    // ── Session Storage: restore on mount ──────────────────────────────────────
    const SESSION_KEY = "trueskill_dashboard_v2";

    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (!saved) return;
            const d = JSON.parse(saved);
            if (d.repoUrl)        setRepoUrl(d.repoUrl);
            if (d.repoId)         setRepoId(d.repoId);
            if (d.githubUsername) setGithubUsername(d.githubUsername);
            if (d.extractedRepos?.length) setExtractedRepos(d.extractedRepos);
            if (d.selectedRepos?.length)  setSelectedRepos(new Set(d.selectedRepos as string[]));
            if (d.multiRepoIds?.length)   setMultiRepoIds(d.multiRepoIds);
            if (d.analysisResult) setAnalysisResult(d.analysisResult);
            if (d.bridgeProjects?.length) setBridgeProjects(d.bridgeProjects);
            if (d.gapSummary)     setGapSummary(d.gapSummary);
            if (d.jobDescription) setJobDescription(d.jobDescription);
            if (d.atsReport)      setAtsReport(d.atsReport);
            if (d.pdfFileName)    setPdfFileName(d.pdfFileName);
            if (d.viewMode)       setViewMode(d.viewMode as ViewMode);
        } catch { /* silently ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Session Storage: save whenever key state changes ──────────────────────
    useEffect(() => {
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                repoUrl, repoId, githubUsername, extractedRepos,
                selectedRepos: Array.from(selectedRepos),
                multiRepoIds, analysisResult, bridgeProjects, gapSummary,
                jobDescription, atsReport,
                pdfFileName: pdfFile?.name ?? pdfFileName,
                viewMode,
            }));
        } catch { /* quota exceeded or serialization error — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repoUrl, repoId, githubUsername, extractedRepos, selectedRepos,
        multiRepoIds, analysisResult, bridgeProjects, gapSummary,
        jobDescription, atsReport, pdfFile, pdfFileName, viewMode]);

    // ── Reset all state & session ──────────────────────────────────────────────
    const handleResetAll = useCallback(() => {
        sessionStorage.removeItem(SESSION_KEY);
        setRepoUrl(""); setRepoId(null); setGithubUsername(null);
        setExtractedRepos([]); setSelectedRepos(new Set()); setMultiRepoIds([]);
        setAnalysisResult(null); setGraphNodes([]); setGraphLinks([]);
        setBridgeProjects([]); setGapSummary(null); setJobDescription("");
        setAtsReport(null); setPdfFile(null); setPdfFileName(null);
        setTimelineData({}); setViewMode("cards"); setGraphRepoId(null);
        setError(null); setExtractionError(null); setCoachError(null);
        setAtsError(null); setAgentMessages([]); setAgentStatus(null);
        setIsManualMode(false);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Multi-repo analyze flow ────────────────────────────────────────────────
    const handleMultiRepoAnalyze = useCallback(async () => {
        if (selectedRepos.size === 0) { setError("Please select at least one repository"); return; }
        if (!pdfFile) { setError("Please re-upload your resume PDF to run analysis"); return; }

        setIsIngesting(true);
        setError(null);
        setAgentMessages([]);
        setAnalysisResult(null);

        const urls = Array.from(selectedRepos);
        const ids: string[] = [];

        try {
            // Step 1: Ingest each selected repo
            for (let i = 0; i < urls.length; i++) {
                const repoName = urls[i].split("/").pop() ?? urls[i];
                setAgentStatus(`Ingesting repo ${i + 1}/${urls.length}: ${repoName}`);
                setAgentMessages(prev => [...prev, `📦 Ingesting ${repoName}...`]);

                const res = await fetch(`${API_BASE_URL}/api/ingest`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ github_url: urls[i] }),
                });

                if (!res.ok) {
                    const e = await res.json().catch(() => ({}));
                    throw new Error(e.detail || `Failed to ingest ${repoName}`);
                }
                const data = await res.json();
                ids.push(data.repo_id);
                setAgentMessages(prev => [...prev, `✅ Ingested: ${data.repo_id}`]);
            }

            setMultiRepoIds(ids);
            setRepoId(ids[0]);
            setIsIngesting(false);

            // Step 2: Set graphRepoId — 'all' for multiple repos, single id for one
            // Using state instead of calling fetchGraphData directly so the useEffect
            // handles it cleanly rather than racing with the repoId setter above.
            setGraphRepoId(ids.length > 1 ? "all" : ids[0]);

            // Step 3: Run multi-repo analysis
            setIsAnalyzing(true);
            setAgentStatus(`Analyzing ${ids.length} repo${ids.length > 1 ? "s" : ""}...`);
            setAgentMessages(prev => [...prev, `🔍 Running multi-repo analysis on ${ids.length} repo${ids.length > 1 ? "s" : ""}...`]);

            const formData = new FormData();
            formData.append("pdf_file", pdfFile);
            formData.append("repo_ids", JSON.stringify(ids));

            const analyzeRes = await fetch(`${API_BASE_URL}/api/analyze/multi`, {
                method: "POST",
                body: formData,
            });

            if (!analyzeRes.ok) {
                const e = await analyzeRes.json().catch(() => ({}));
                throw new Error(e.detail || "Multi-repo analysis failed");
            }

            const result = await analyzeRes.json();
            setAnalysisResult(result);
            setAgentMessages(prev => [...prev, `✨ Analysis complete! ${result.verification_results?.length ?? 0} skills verified across ${ids.length} repo${ids.length > 1 ? "s" : ""}.`]);
            setAgentStatus(null);

        } catch (err) {
            setError(err instanceof Error ? err.message : "Analysis failed");
        } finally {
            setIsIngesting(false);
            setIsAnalyzing(false);
        }
    }, [selectedRepos, pdfFile, fetchGraphData]);

    // Handle PDF upload and trigger extraction
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === "application/pdf") {
            setPdfFile(file);
            setError(null);
            
            // Auto-detect GitHub profile
            setIsExtracting(true);
            setExtractedRepos([]);
            setGithubUsername(null);
            setExtractionError(null);

            try {
                const formData = new FormData();
                formData.append("pdf_file", file);

                const response = await fetch(`${API_BASE_URL}/api/extract-profile`, {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    setExtractionError(errData.detail || "Could not auto-detect GitHub profile.");
                    setIsManualMode(true);
                } else {
                    const data = await response.json();
                    setGithubUsername(data.username);
                    if (data.repos && data.repos.length > 0) {
                        setExtractedRepos(data.repos);
                        setIsManualMode(false);
                    } else {
                        setExtractionError("GitHub profile found, but no public repositories available.");
                        setIsManualMode(true);
                    }
                }
            } catch (err) {
                setExtractionError("Failed to connect to extraction service.");
                setIsManualMode(true);
            } finally {
                setIsExtracting(false);
            }
        } else {
            setError("Please upload a valid PDF file");
        }
    }, []);

    // Process SSE Stream
    const processStreamResponse = async (response: Response) => {
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || "Analysis failed");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Stream not supported");
        
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (!dataStr) continue;
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.type === "progress") {
                            setAgentStatus(data.message);
                            setAgentMessages(prev => [...prev, data.message]);
                        } else if (data.type === "complete") {
                            setAnalysisResult(data);
                        } else if (data.type === "error") {
                            throw new Error(data.message || "Analysis failed");
                        }
                    } catch (e) {
                        if (e instanceof Error && e.message !== "SSE Parse error") {
                            throw e;
                        }
                        console.error("SSE Parse error", e);
                    }
                }
            }
        }
    };

    // 1-Click Auto Pipeline
    const handleAutoAnalyze = async (selectedRepoUrl: string) => {
        setRepoUrl(selectedRepoUrl);
        setIsIngesting(true);
        setError(null);
        setAgentMessages([]);

        try {
            // STEP 1: Ingest
            const ingestResponse = await fetch(`${API_BASE_URL}/api/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ github_url: selectedRepoUrl }),
            });

            if (!ingestResponse.ok) {
                const errData = await ingestResponse.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to ingest repository");
            }

            const ingestData = await ingestResponse.json();
            const newRepoId = ingestData.repo_id;
            setRepoId(newRepoId);
            setGraphRepoId(newRepoId);
            setIsIngesting(false);

            // STEP 2: Analyze
            if (!pdfFile) throw new Error("Resume PDF is missing");
            setIsAnalyzing(true);
            setAgentStatus("Starting analysis...");
            
            const formData = new FormData();
            formData.append("pdf_file", pdfFile);
            formData.append("repo_id", newRepoId);

            const analyzeResponse = await fetch(`${API_BASE_URL}/api/analyze?repo_id=${newRepoId}`, {
                method: "POST",
                body: formData,
            });

            await processStreamResponse(analyzeResponse);

        } catch (err) {
            setError(err instanceof Error ? err.message : "Auto-analysis failed");
        } finally {
            setIsIngesting(false);
            setIsAnalyzing(false);
        }
    };

    // Ingest repository
    const handleIngestRepo = async () => {
        if (!repoUrl) {
            setError("Please enter a GitHub repository URL");
            return;
        }

        setIsIngesting(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ github_url: repoUrl }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to ingest repository");
            }

            const data = await response.json();
            setRepoId(data.repo_id);
            setGraphRepoId(data.repo_id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ingestion failed");
        } finally {
            setIsIngesting(false);
        }
    };

    // Analyze resume
    const handleAnalyze = async () => {
        if (!pdfFile) {
            setError("Please upload a PDF resume first");
            return;
        }

        if (!repoId) {
            setError("Please ingest a repository first");
            return;
        }

        setIsAnalyzing(true);
        setAgentStatus("Starting analysis...");
        setAgentMessages([]);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("pdf_file", pdfFile);
            formData.append("repo_id", repoId);

            const response = await fetch(`${API_BASE_URL}/api/analyze?repo_id=${repoId}`, {
                method: "POST",
                body: formData,
            });

            await processStreamResponse(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analysis failed");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleGenerateActionPlan = async () => {
        if (!jobDescription.trim()) {
            setCoachError("Please enter a job description");
            return;
        }

        if (!analysisResult?.verification_results.length) {
            setCoachError("Please analyze a resume first to get verified skills");
            return;
        }

        setIsGeneratingPlan(true);
        setCoachError(null);

        try {
            const verifiedSkills = analysisResult.verification_results.map((r) => ({
                topic: r.topic,
                score: r.score,
                status: r.status,
            }));

            const response = await fetch(`${API_BASE_URL}/api/coach`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    verified_skills: verifiedSkills,
                    job_description: jobDescription,
                    num_projects: numProjects,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to generate action plan");
            }

            const data = await response.json();
            // Accept both the new array format and the old singular format
            const projects: BridgeProject[] = data.bridge_projects ?? (data.bridge_project ? [data.bridge_project] : []);
            setBridgeProjects(projects);
            setGapSummary(data.gap_analysis_summary ?? null);
            setActiveBridgeTab(0);
            setShowAllSteps(false);
        } catch (err) {
            setCoachError(err instanceof Error ? err.message : "Failed to generate plan");
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    // Handle graph node click
    const handleNodeClick = useCallback((node: GraphNode) => {
        console.log("Node clicked:", node);
    }, []);

    // Handle ATS score generation
    const handleGetATSScore = useCallback(async () => {
        if (!pdfFile) {
            setAtsError("Please upload your resume PDF first.");
            return;
        }
        if (!jobDescription.trim()) {
            setAtsError("Please paste a job description first.");
            return;
        }
        setIsScoring(true);
        setAtsError(null);
        setAtsReport(null);
        try {
            const formData = new FormData();
            formData.append("pdf_file", pdfFile);
            formData.append("job_description", jobDescription);
            const res = await fetch("http://localhost:8000/api/ats-score", {
                method: "POST",
                body: formData,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: "ATS scoring failed" }));
                throw new Error(err.detail ?? "ATS scoring failed");
            }
            const data: ATSReport = await res.json();
            setAtsReport(data);
        } catch (e) {
            setAtsError(e instanceof Error ? e.message : "ATS scoring failed");
        } finally {
            setIsScoring(false);
        }
    }, [pdfFile, jobDescription]);

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-50 via-white to-slate-100 selection:bg-indigo-100 selection:text-indigo-900">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-indigo-100/50 px-6 py-4 shadow-sm transition-all">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    {/* Left: back link + title + controls */}
                    <div className="flex items-center gap-3">
                        {/* ← Home */}
                        <Link
                            href="/"
                            className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition-colors duration-200 text-sm font-medium group"
                        >
                            <ArrowLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                            <span className="hidden sm:inline">Home</span>
                        </Link>
                        <div className="w-px h-5 bg-slate-200" />
                        <div>
                            <div className="flex items-center gap-2.5 mb-1">
                                <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 tracking-tight">TrueSkill AI</h1>
                                <button
                                    onClick={() => setIsManualMode(!isManualMode)}
                                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-all duration-300 ${isManualMode ? "bg-indigo-100 text-indigo-700 shadow-inner" : "bg-slate-100 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:shadow-sm"}`}
                                >
                                    {isManualMode ? "Hide Manual Input" : "Manual Input"}
                                </button>
                                {/* Reset button */}
                                <button
                                    onClick={handleResetAll}
                                    title="Reset all state and start over"
                                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 transition-all duration-200 border border-red-100"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    Reset
                                </button>
                            </div>
                            <p className="text-sm text-slate-500 font-medium tracking-wide">Automated Competency Verification System</p>
                        </div>
                    </div>


                    {/* Summary Stats */}
                    {analysisResult?.summary && (
                        <div className="flex items-center gap-4 text-sm bg-white/60 backdrop-blur-md py-2 px-5 rounded-2xl border border-indigo-50 shadow-[0_2px_10px_rgb(0,0,0,0.04)] animate-slide-in-right">
                            <div className="flex items-center gap-2 animate-slide-in-right" style={{ animationDelay: "0ms" }}>
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                <span className="text-slate-600">
                                    <AnimatedCounter target={analysisResult.summary.verified} className="font-semibold" /> Verified
                                </span>
                            </div>
                            <div className="flex items-center gap-2 animate-slide-in-right" style={{ animationDelay: "60ms" }}>
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                                <span className="text-slate-600">
                                    <AnimatedCounter target={analysisResult.summary.partially_verified} className="font-semibold" /> Partial
                                </span>
                            </div>
                            <div className="flex items-center gap-2 animate-slide-in-right" style={{ animationDelay: "120ms" }}>
                                <XCircle className="w-4 h-4 text-red-500" />
                                <span className="text-slate-600">
                                    <AnimatedCounter target={analysisResult.summary.unverified} className="font-semibold" /> Unverified
                                </span>
                            </div>
                            {/* Radial avg score ring */}
                            <div className="flex items-center gap-2 pl-3 border-l border-slate-200 animate-slide-in-right" style={{ animationDelay: "180ms" }}>
                                <div className="relative w-9 h-9 flex-shrink-0">
                                    <svg width="36" height="36" style={{ transform: "rotate(-90deg)" }}>
                                        <circle cx="18" cy="18" r="13" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                                        <circle
                                            cx="18" cy="18" r="13"
                                            fill="none"
                                            stroke="#6366f1"
                                            strokeWidth="4"
                                            strokeLinecap="round"
                                            strokeDasharray={`${2 * Math.PI * 13}`}
                                            strokeDashoffset={`${2 * Math.PI * 13 * (1 - analysisResult.summary.average_score / 100)}`}
                                            className="score-ring"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-[9px] font-bold text-indigo-600" style={{ transform: "rotate(0deg)" }}>
                                            {analysisResult.summary.average_score}%
                                        </span>
                                    </div>
                                </div>
                                <span className="font-medium text-slate-700">Avg Score</span>
                            </div>

                            {/* Authenticity Score Meter */}
                            {analysisResult.authenticity_score !== null && analysisResult.authenticity_score !== undefined && (
                                <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${analysisResult.authenticity_score >= 80
                                    ? "bg-emerald-50 border border-emerald-200"
                                    : analysisResult.authenticity_score >= 50
                                        ? "bg-amber-50 border border-amber-200"
                                        : "bg-red-50 border border-red-200"
                                    }`}>
                                    {analysisResult.authenticity_score >= 80 ? (
                                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                    ) : analysisResult.authenticity_score >= 50 ? (
                                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                                    ) : (
                                        <ShieldX className="w-4 h-4 text-red-600" />
                                    )}
                                    <span className={`font-medium text-sm ${analysisResult.authenticity_score >= 80
                                        ? "text-emerald-700"
                                        : analysisResult.authenticity_score >= 50
                                            ? "text-amber-700"
                                            : "text-red-700"
                                        }`}>
                                        Authenticity: {analysisResult.authenticity_score}%
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Control Bar */}
            {isManualMode && (
                <div className="bg-slate-100 border-b border-slate-300 px-6 py-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="max-w-7xl mx-auto flex items-center gap-4">
                    {/* GitHub URL Input */}
                    <div className="flex-1 flex items-center gap-2">
                        <Github className="w-5 h-5 text-slate-400" />
                        <input
                            id="github-url-input"
                            type="text"
                            placeholder="Enter GitHub repository URL..."
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                            id="ingest-btn"
                            onClick={handleIngestRepo}
                            disabled={isIngesting || !repoUrl}
                            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isIngesting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Ingesting...
                                </>
                            ) : (
                                "Ingest Repo"
                            )}
                        </button>
                    </div>

                    {/* Repo ID Badge */}
                    {repoId && (
                        <div className="px-3 py-1 bg-emerald-50 text-emerald-700 text-sm rounded-full border border-emerald-200">
                            Repo: {repoId}
                        </div>
                    )}

                    {/* Analyze Button */}
                    <button
                        id="analyze-btn"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || !pdfFile || !repoId}
                        className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                        {isAnalyzing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <FileText className="w-4 h-4" />
                                Analyze Resume
                            </>
                        )}
                    </button>
                </div>
            </div>
            )}

            {/* Authenticity Warning Banner */}
                {analysisResult?.authenticity_score !== null &&
                    analysisResult?.authenticity_score !== undefined &&
                    analysisResult.authenticity_score < 50 && (
                        <div className="max-w-7xl mx-auto mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                            <ShieldX className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-800">High probability of AI-generated or copy-pasted code</p>
                                <p className="text-sm text-red-600 mt-1">
                                    The code in this repository shows inconsistent styling patterns, mixed naming conventions,
                                    or suspicious commit history. Authenticity score: {analysisResult.authenticity_score}%
                                </p>
                                {analysisResult.forensics?.warnings && analysisResult.forensics.warnings.length > 0 && (
                                    <ul className="mt-2 text-xs text-red-600 list-disc list-inside">
                                        {analysisResult.forensics.warnings.map((warning, idx) => (
                                            <li key={idx}>{warning}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

            {/* Main Content - Split Screen */}
            <main className="max-w-7xl mx-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-6 h-[calc(100vh-380px)]">

                    {/* Left Panel - PDF Viewer */}
                    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow duration-300">
                        <div className="px-5 py-4 border-b border-slate-100 bg-white/50 backdrop-blur-md">
                            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-500" />
                                Resume Document
                            </h2>
                        </div>

                        <div className="flex-1 flex flex-col p-0 overflow-hidden">
                            {pdfFile ? (
                                <div className="flex flex-col h-full bg-slate-50 relative">
                                    <div className="flex-1 overflow-y-auto p-6">
                                        <div className="text-center mb-6">
                                            <FileText className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                                            <p className="text-slate-700 font-medium">{pdfFile.name}</p>
                                            <p className="text-sm text-slate-500 mt-1">
                                                {(pdfFile.size / 1024).toFixed(1)} KB
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setPdfFile(null);
                                                    setExtractedRepos([]);
                                                    setGithubUsername(null);
                                                    setRepoUrl("");
                                                    setRepoId(null);
                                                    setAnalysisResult(null);
                                                }}
                                                className="mt-2 text-sm text-red-600 hover:text-red-700"
                                            >
                                                Start Over
                                            </button>
                                        </div>

                                        {/* Extraction UI */}
                                        {isExtracting ? (
                                            <div className="mt-8 text-center p-6 bg-white rounded-xl border border-slate-200">
                                                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
                                                <p className="font-medium text-slate-800">Scanning Resume...</p>
                                                <p className="text-sm text-slate-500 mt-1">Looking for your GitHub profile</p>
                                            </div>
                                        ) : extractionError ? (
                                            <div className="mt-4 p-5 text-center bg-amber-50 rounded-xl border border-amber-200">
                                                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                                                <p className="font-medium text-amber-800">Auto-Detection Failed</p>
                                                <p className="text-sm text-amber-700 mt-1 max-w-sm mx-auto">{extractionError}</p>
                                                {!isManualMode && (
                                                    <button onClick={() => setIsManualMode(true)} className="mt-4 px-3 py-1.5 bg-white border border-slate-200 rounded text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">
                                                        Enter Repository Manually
                                                    </button>
                                                )}
                                            </div>
                                        ) : extractedRepos.length > 0 ? (
                                            <div className="mt-4">
                                                {/* Header row: username + Select All / Deselect All */}
                                                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                                                    <div className="flex items-center gap-2">
                                                        <Github className="w-5 h-5 text-slate-700" />
                                                        <h3 className="font-semibold text-slate-800">
                                                            Found <span className="text-blue-600">@{githubUsername}</span>
                                                        </h3>
                                                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                            {extractedRepos.length} repos
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => setSelectedRepos(new Set(extractedRepos.map(r => r.html_url)))}
                                                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors border border-indigo-100"
                                                        >
                                                            <CheckSquare className="w-3.5 h-3.5" /> Select All
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedRepos(new Set())}
                                                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors border border-slate-200"
                                                        >
                                                            <Square className="w-3.5 h-3.5" /> Deselect All
                                                        </button>
                                                    </div>
                                                </div>

                                                <p className="text-sm text-slate-500 mb-3">
                                                    {selectedRepos.size > 0
                                                        ? <><strong className="text-indigo-600">{selectedRepos.size}</strong> repo{selectedRepos.size > 1 ? "s" : ""} selected — click to toggle</>
                                                        : "Click repos to select them for analysis:"}
                                                </p>

                                                <div className="space-y-3 pb-2">
                                                    {extractedRepos.map((repo, repoIdx) => {
                                                        const isSelected = selectedRepos.has(repo.html_url);
                                                        return (
                                                            <div
                                                                key={repo.name}
                                                                onClick={() => toggleRepoSelection(repo.html_url)}
                                                                className={`p-4 bg-white border animate-slide-in-left ${
                                                                    isSelected
                                                                        ? "border-indigo-400 ring-1 ring-indigo-400 shadow-md border-l-4 border-l-indigo-500"
                                                                        : "border-slate-200 hover:border-indigo-300 hover:shadow-sm hover:border-l-4 hover:border-l-indigo-300"
                                                                } rounded-lg cursor-pointer transition-all group`}
                                                                style={{ animationDelay: `${repoIdx * 80}ms` }}
                                                            >
                                                                <div className="flex items-start justify-between mb-1">
                                                                    <h4 className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                                                        {/* Checkbox indicator */}
                                                                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? "bg-indigo-500 border-indigo-500" : "border-slate-300 group-hover:border-indigo-300"}`}>
                                                                            {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                                                                        </div>
                                                                        {repo.name}
                                                                    </h4>
                                                                    {repo.language && (
                                                                        <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded whitespace-nowrap ml-2 flex-shrink-0">
                                                                            {repo.language}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {repo.description && (
                                                                    <p className="text-xs text-slate-500 mb-3 line-clamp-2 ml-6">
                                                                        {repo.description}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-3 text-xs text-slate-400 ml-6">
                                                                    <div className="flex items-center gap-1">
                                                                        <Star className="w-3.5 h-3.5" />
                                                                        {repo.stargazers_count}
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        <Clock className="w-3.5 h-3.5" />
                                                                        Updated {new Date(repo.updated_at).toLocaleDateString()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Start Analyzing CTA */}
                                                <button
                                                    onClick={handleMultiRepoAnalyze}
                                                    disabled={selectedRepos.size === 0 || isIngesting || isAnalyzing || !pdfFile}
                                                    className="mt-4 w-full py-3 px-4 font-bold text-sm text-white rounded-xl flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                                    style={{
                                                        background: selectedRepos.size > 0 && pdfFile
                                                            ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
                                                            : "linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)",
                                                        boxShadow: selectedRepos.size > 0 && pdfFile ? "0 8px 25px rgba(99,102,241,0.35)" : "none",
                                                    }}
                                                >
                                                    {(isIngesting || isAnalyzing) ? (
                                                        <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing {selectedRepos.size} repo{selectedRepos.size > 1 ? "s" : ""}...</>
                                                    ) : (
                                                        <><Play className="w-4 h-4" /> Start Analyzing
                                                            {selectedRepos.size > 0 && <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">{selectedRepos.size} repo{selectedRepos.size > 1 ? "s" : ""}</span>}
                                                        </>
                                                    )}
                                                </button>

                                                {/* Warning if no PDF uploaded but repos selected */}
                                                {selectedRepos.size > 0 && !pdfFile && (
                                                    <p className="mt-2 text-xs text-amber-600 text-center flex items-center justify-center gap-1">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        {pdfFileName
                                                            ? <>Re-upload <strong>{pdfFileName}</strong> to enable analysis</>
                                                            : "Upload your resume PDF to enable analysis"}
                                                    </p>
                                                )}
                                            </div>

                                        ) : githubUsername ? (
                                            <div className="mt-8 text-center p-6 bg-slate-50 rounded-xl border border-slate-200">
                                                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                                                <p className="font-medium text-slate-800">Found @{githubUsername}</p>
                                                <p className="text-sm text-slate-500 mt-1">No public repositories were found on this profile.</p>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 h-full flex items-center justify-center">
                                    <label
                                        className={`cursor-pointer w-full h-full flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-all duration-300 ${
                                            isDragging
                                                ? "drag-active scale-[1.02]"
                                                : "border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30"
                                        }`}
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            setIsDragging(false);
                                            const file = e.dataTransfer.files?.[0];
                                            if (file) handleFileUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
                                        }}
                                    >
                                        <Upload className={`w-12 h-12 mb-4 transition-all duration-300 ${
                                            isDragging ? "text-indigo-500 scale-125 animate-float" : "text-slate-400 animate-float"
                                        }`} />
                                        <p className={`font-medium transition-colors duration-200 ${
                                            isDragging ? "text-indigo-600" : "text-slate-600"
                                        }`}>
                                            {isDragging ? "Release to upload" : "Drop Resume PDF to Auto-Detect GitHub"}
                                        </p>
                                        <p className="text-sm text-slate-400 mt-1">Supports PDF files only (max 10 MB)</p>
                                        <input
                                            id="pdf-upload"
                                            type="file"
                                            accept=".pdf"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* LinkedIn URL Input (Feature 9) */}
                        <div className="px-6 py-3 border-t border-slate-100">
                            <div className="flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                <input
                                    type="url"
                                    placeholder="LinkedIn profile URL (optional)"
                                    value={linkedinUrl}
                                    onChange={(e) => setLinkedinUrl(e.target.value)}
                                    className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none placeholder:text-slate-400"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Panel - Evidence & Skill Cards / Graph View */}
                    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow duration-300">
                        <div className="px-5 py-3 border-b border-slate-100 bg-white/50 backdrop-blur-md flex items-center justify-between">
                            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                                {viewMode === "cards" ? <Target className="w-4 h-4 text-violet-500" /> : <Network className="w-4 h-4 text-fuchsia-500" />}
                                {viewMode === "cards" ? "Verification Results" : "Knowledge Graph"}
                            </h2>

                            <div className="flex items-center gap-2">
                                {analysisResult && viewMode === "cards" && (
                                    <>
                                        <span className="text-sm text-slate-500 mr-2">
                                            {analysisResult.claims_extracted} claims analyzed
                                        </span>
                                        <button
                                            onClick={handleExportReport}
                                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors border border-emerald-200"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Export
                                        </button>
                                        <button
                                            onClick={handleSaveAnalysis}
                                            disabled={isSaving}
                                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50"
                                        >
                                            {saveSuccess ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                            {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save"}
                                        </button>
                                        <a
                                            href="/compare"
                                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-violet-50 text-violet-700 rounded-lg hover:bg-violet-100 transition-colors border border-violet-200"
                                        >
                                            Compare
                                        </a>
                                    </>
                                )}

                                {/* Toggle View Button */}
                                <div className="flex bg-slate-200 rounded-lg p-1">
                                    <button
                                        id="view-cards-btn"
                                        onClick={() => setViewMode("cards")}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors ${viewMode === "cards"
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-600 hover:text-slate-900"
                                            }`}
                                    >
                                        <List className="w-3.5 h-3.5" />
                                        Cards
                                    </button>
                                    <button
                                        id="view-graph-btn"
                                        onClick={() => setViewMode("graph")}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors ${viewMode === "graph"
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-600 hover:text-slate-900"
                                            }`}
                                    >
                                        <Network className="w-3.5 h-3.5" />
                                        3D Graph
                                    </button>
                                </div>

                                {/* Fullscreen expand button — only in graph mode */}
                                {viewMode === "graph" && (
                                    <button
                                        id="graph-fullscreen-btn"
                                        onClick={() => setIsGraphFullscreen(true)}
                                        title="Expand to fullscreen"
                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200"
                                    >
                                        <Maximize2 className="w-3.5 h-3.5" />
                                        Fullscreen
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden">
                            {error && (
                                <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-red-800">Error</p>
                                        <p className="text-sm text-red-600 mt-1">{error}</p>
                                    </div>
                                </div>
                            )}
                            
                            {viewMode === "cards" ? (
                                // Skill Cards View
                                <div className="h-full overflow-y-auto p-4 space-y-3">
                                    {isAnalyzing ? (
                                        // Terminal-style Agent UI
                                        <div className="flex flex-col gap-4 p-6 h-full">
                                            <div className="flex items-center gap-3">
                                                <div className="relative flex-shrink-0">
                                                    <div className="absolute inset-0 bg-indigo-400/20 rounded-full blur-md animate-pulse" />
                                                    <div className="w-10 h-10 rounded-full bg-white border border-indigo-100 shadow-sm flex items-center justify-center relative z-10">
                                                        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-slate-800 text-sm">AI Agent Analyzing</h3>
                                                    <p className="text-xs text-slate-400">Verifying resume claims against code…</p>
                                                </div>
                                            </div>
                                            <AgentTerminal messages={agentMessages.slice(0, -1)} current={agentStatus} />
                                        </div>
                                    ) : analysisResult?.verification_results.length ? (
                                        analysisResult.verification_results.map((result) => (
                                            <SkillCard key={result.claim_id} result={result} />
                                        ))
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                            <div className="relative mb-4">
                                                <div className="absolute inset-0 animate-ping-slow rounded-full bg-slate-200" />
                                                <AlertCircle className="w-12 h-12 relative z-10 text-slate-300" />
                                            </div>
                                            <p className="font-medium text-slate-400">No results yet</p>
                                            <p className="text-sm mt-1 text-slate-400">
                                                Upload a resume and click Analyze to get started
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // 3D Graph View — wrapped in ErrorBoundary
                                <ErrorBoundary fallbackTitle="3D Graph failed to load">
                                    <div className="h-full">
                                        {isIngesting ? (
                                            <IngestionLoader active={isIngesting} />
                                        ) : isLoadingGraph ? (
                                            <GraphSkeleton />
                                        ) : graphNodes.length > 0 ? (
                                            <GraphVisualizer
                                                nodes={graphNodes}
                                                links={graphLinks}
                                                onNodeClick={handleNodeClick}
                                            />
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center bg-slate-900 rounded-lg text-slate-400">
                                                <div className="relative mb-4">
                                                    <div className="absolute inset-0 animate-ping-slow rounded-full bg-slate-700" />
                                                    <Network className="w-12 h-12 relative z-10" />
                                                </div>
                                                <p className="font-medium">No graph data</p>
                                                <p className="text-sm mt-1">
                                                    Ingest a repository to see the knowledge graph
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </ErrorBoundary>
                            )}
                        </div>

                        {/* Skill Timeline (Feature 8) */}
                        {Object.keys(timelineData).length > 0 && (
                            <div className="px-5 py-4 border-t border-slate-100">
                                <SkillTimeline timeline={timelineData} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Career Coach Section */}
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden mt-6 relative isolate group">
                    <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
                        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-violet-200 to-fuchsia-200 opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem] transition-opacity duration-700 group-hover:opacity-50"></div>
                    </div>
                    <div className="p-8">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-3 bg-gradient-to-br from-violet-100 to-fuchsia-100 rounded-xl shadow-inner border border-white">
                                <Sparkles className="w-6 h-6 text-violet-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-violet-700 to-fuchsia-700 tracking-tight">Career Coach</h2>
                                <p className="text-sm text-slate-500 font-medium mt-0.5">Get a personalized action plan to bridge skill gaps</p>
                            </div>
                        </div>

                    <div className="grid grid-cols-2 gap-6">
                        {/* Job Description Input */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Target Job Description
                            </label>
                            <div className="relative">
                                <textarea
                                    id="job-description-input"
                                    placeholder="Paste the job description you're targeting here..."
                                    value={jobDescription}
                                    onChange={(e) => setJobDescription(e.target.value)}
                                    onFocus={() => setCoachFocused(true)}
                                    onBlur={() => setCoachFocused(false)}
                                    className={`w-full h-40 px-4 py-3 border rounded-xl text-sm focus:outline-none resize-none transition-all duration-300 ${
                                        coachFocused
                                            ? "border-violet-400 shadow-[0_0_0_3px_rgba(139,92,246,0.15),0_0_20px_rgba(139,92,246,0.1)]"
                                            : "border-slate-300 hover:border-slate-400"
                                    }`}
                                />
                                {jobDescription && (
                                    <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 pointer-events-none">
                                        {jobDescription.split(/\s+/).filter(Boolean).length} words
                                    </div>
                                )}
                            </div>

                            {coachError && (
                                <p className="mt-2 text-sm text-red-600">{coachError}</p>
                            )}
                            {atsError && (
                                <p className="mt-1 text-sm text-red-600">{atsError}</p>
                            )}

                            {/* Action buttons row */}
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button
                                    id="generate-plan-btn"
                                    onClick={handleGenerateActionPlan}
                                    disabled={isGeneratingPlan || !jobDescription.trim()}
                                    className="relative overflow-hidden px-6 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-violet-200"
                                >
                                    {isGeneratingPlan && (
                                        <span className="absolute inset-0 animate-shimmer-dark opacity-30" />
                                    )}
                                    {isGeneratingPlan ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin relative z-10" />
                                            <span className="relative z-10">Generating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4 relative z-10" />
                                            <span className="relative z-10">Generate Action Plan</span>
                                        </>
                                    )}
                                </button>

                                {/* numProjects picker */}
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-slate-500 font-medium">Projects:</span>
                                    {[1, 2, 3, 4, 5].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setNumProjects(n)}
                                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                                                numProjects === n
                                                    ? "bg-violet-600 text-white shadow-sm"
                                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    id="get-ats-score-btn"
                                    onClick={handleGetATSScore}
                                    disabled={isScoring || !jobDescription.trim() || !pdfFile}
                                    className="px-5 py-2.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{
                                        background: isScoring ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.12)",
                                        border: "1px solid rgba(99,102,241,0.35)",
                                        color: "#6366f1",
                                    }}
                                >
                                    {isScoring ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Scoring...
                                        </>
                                    ) : (
                                        <>
                                            <FileSearch className="w-4 h-4" />
                                            Get ATS Score
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Bridge Projects Carousel */}
                        <div>
                            {bridgeProjects.length > 0 ? (
                                <div className="space-y-3">
                                    {/* Gap Analysis Summary */}
                                    {gapSummary && (
                                        <div className="px-4 py-3 rounded-xl text-xs text-slate-600 leading-relaxed" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                                            <span className="font-bold text-violet-700">Gap Analysis: </span>{gapSummary}
                                        </div>
                                    )}

                                    {/* Project Tabs */}
                                    {bridgeProjects.length > 1 && (
                                        <div className="flex gap-1.5">
                                            {bridgeProjects.map((p, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => { setActiveBridgeTab(idx); setShowAllSteps(false); }}
                                                    className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all truncate ${
                                                        activeBridgeTab === idx
                                                            ? "bg-violet-600 text-white shadow-sm"
                                                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                                    }`}
                                                    title={p.gap_skill}
                                                >
                                                    #{idx + 1} {p.gap_skill}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Active Project Card */}
                                    {(() => {
                                        const proj = bridgeProjects[activeBridgeTab];
                                        if (!proj) return null;
                                        return (
                                            <div className="bg-white rounded-xl border border-slate-200 p-5">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="inline-block px-2 py-1 bg-violet-100 text-violet-700 text-xs font-medium rounded">
                                                                Bridge Project #{proj.rank ?? activeBridgeTab + 1}
                                                            </span>
                                                            {(proj.estimated_score_gain ?? 0) > 0 && (
                                                                <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded border border-indigo-100">
                                                                    +{proj.estimated_score_gain}% match boost
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h3 className="text-lg font-semibold text-slate-900">{proj.project_title}</h3>
                                                    </div>
                                                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                                                        proj.difficulty === "Beginner" ? "bg-green-100 text-green-700" :
                                                        proj.difficulty === "Intermediate" ? "bg-amber-100 text-amber-700" :
                                                        "bg-red-100 text-red-700"
                                                    }`}>
                                                        {proj.difficulty}
                                                    </span>
                                                </div>

                                                <p className="text-sm text-slate-600 mb-3">{proj.description}</p>

                                                {(proj.why_this_gap) && (
                                                    <p className="text-xs text-slate-500 italic mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                                                        💡 {proj.why_this_gap}
                                                    </p>
                                                )}

                                                <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                                                    <div className="flex items-center gap-1">
                                                        <Target className="w-3.5 h-3.5" />
                                                        <span>Gap: <strong className="text-violet-600">{proj.gap_skill}</strong></span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        <span>{proj.estimated_time}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5 mb-4">
                                                    {proj.tech_stack.map((tech, idx2) => (
                                                        <span
                                                            key={idx2}
                                                            className="px-2.5 py-0.5 bg-violet-50 text-violet-700 text-xs font-medium rounded-full border border-violet-100 hover:bg-violet-100 hover:-translate-y-0.5 transition-all duration-150 cursor-default"
                                                        >
                                                            {tech}
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Learning Outcomes */}
                                                {proj.learning_outcomes?.length > 0 && (
                                                    <div className="mb-4">
                                                        <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                                                            <Star className="w-3.5 h-3.5 text-amber-500" />
                                                            Learning Outcomes
                                                        </h4>
                                                        <ul className="space-y-1">
                                                            {proj.learning_outcomes.map((lo, i) => (
                                                                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                                                    <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                                                                    {lo}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                <div className="border-t border-slate-100 pt-4">
                                                    <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                                                        <BookOpen className="w-3.5 h-3.5" />
                                                        Steps to Complete
                                                    </h4>
                                                    <ul className="space-y-1.5">
                                                        {(showAllSteps ? proj.steps : proj.steps.slice(0, 4)).map((step, i2) => (
                                                            <li key={i2} className="flex items-start gap-2 text-xs text-slate-600">
                                                                <ChevronRight className="w-3 h-3 text-violet-500 mt-0.5 flex-shrink-0" />
                                                                <span>{step}</span>
                                                            </li>
                                                        ))}
                                                        {proj.steps.length > 4 && (
                                                            <li>
                                                                <button
                                                                    onClick={() => setShowAllSteps(!showAllSteps)}
                                                                    className="text-xs text-violet-500 hover:text-violet-700 ml-5 cursor-pointer transition-colors"
                                                                >
                                                                    {showAllSteps ? "Show less" : `+${proj.steps.length - 4} more steps...`}
                                                                </button>
                                                            </li>
                                                        )}
                                                    </ul>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="bg-white/50 rounded-xl border border-dashed border-slate-300 p-6 h-full flex flex-col items-center justify-center text-slate-400">
                                    <BookOpen className="w-10 h-10 mb-3" />
                                    <p className="font-medium">No action plan yet</p>
                                    <p className="text-sm text-center mt-1">
                                        Paste a job description, choose the number of projects, and click Generate
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    </div>

                    {/* ATS Score Panel — shown below the two-column grid when report is ready */}
                    {atsReport && (
                        <div className="mt-6 border-t border-slate-100 pt-6">
                            <ATSScorePanel
                                report={atsReport}
                                candidateName={pdfFile?.name.replace(/\.pdf$/i, "") ?? "Candidate"}
                                apiBaseUrl="http://localhost:8000"
                            />
                        </div>
                    )}
                </div>
            </main>

            {/* Fullscreen Knowledge Graph Portal */}
            {isGraphFullscreen && (
                <GraphFullscreenModal
                    nodes={graphNodes}
                    links={graphLinks}
                    onClose={() => setIsGraphFullscreen(false)}
                    onNodeClick={handleNodeClick}
                    isLoading={isLoadingGraph}
                />
            )}
        </div>
    );
}
