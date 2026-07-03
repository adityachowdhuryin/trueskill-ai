"use client";

import {
    createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode,
} from "react";
import type { GraphNode, GraphLink } from "@/components/GraphVisualizer";
import type {
    GitHubRepo, VerificationResult, AnalysisResponse, BridgeProject,
    SkillsHeatmap, Roadmap, ChatMessage, ATSReport, IngestedRepoRecord,
    ChatAction, ResultTab, ForensicsData,
} from "@/types/dashboard";
import type { ProjectVerificationResult, IngestedRepo } from "@/components/ProjectCard";
import type { ProjectSummaryData } from "@/components/ProjectSummaryBar";

export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000";

const VERIFY_STEPS = [
    "Parsing project blocks from resume…",
    "Matching projects to ingested repos…",
    "Running tech stack coverage checks…",
    "Assessing architectural claims…",
    "Computing final scores…",
];
const PREV_SCORES_KEY = "trueskill_prev_scores";
const SESSION_KEY = "trueskill_dashboard_v2";

// ─── Context Shape ────────────────────────────────────────────────────────────

interface DashboardContextValue {
    // ── Resume / Repo ─────────────────────────────────────────────────────────
    repoUrl: string; setRepoUrl: (v: string) => void;
    repoId: string | null; setRepoId: (v: string | null) => void;
    pdfFile: File | null; setPdfFile: (f: File | null) => void;
    pdfFileName: string | null; setPdfFileName: (v: string | null) => void;
    extractedText: string | null;
    isDragging: boolean; setIsDragging: (v: boolean) => void;

    // ── GitHub ────────────────────────────────────────────────────────────────
    extractedRepos: GitHubRepo[];
    githubUsername: string | null;
    isExtracting: boolean;
    extractionError: string | null;
    isManualMode: boolean; setIsManualMode: (v: boolean) => void;
    selectedRepos: Set<string>; setSelectedRepos: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    toggleRepoSelection: (url: string) => void;
    linkedinUrl: string; setLinkedinUrl: (v: string) => void;

    // ── Ingestion / Analysis ──────────────────────────────────────────────────
    isIngesting: boolean;
    isAnalyzing: boolean;
    agentStatus: string | null;
    agentMessages: string[];
    error: string | null; setError: (v: string | null) => void;
    multiRepoIds: string[];
    graphRepoId: string | null;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    handleIngestRepo: () => Promise<void>;
    handleAnalyze: () => Promise<void>;
    handleMultiRepoAnalyze: () => Promise<void>;
    handleAutoAnalyze: (url: string) => Promise<void>;
    handleResetAll: () => void;

    // ── Analysis Results ──────────────────────────────────────────────────────
    analysisResult: AnalysisResponse | null;
    prevScores: Record<string, number>;
    viewMode: "cards" | "graph"; setViewMode: (v: "cards" | "graph") => void;

    // ── Graph ─────────────────────────────────────────────────────────────────
    graphNodes: GraphNode[];
    graphLinks: GraphLink[];
    isLoadingGraph: boolean;
    graphMeta: Record<string, unknown> | null;
    graphHighlightIds: string[]; setGraphHighlightIds: (v: string[]) => void;
    graphSummary: unknown; setGraphSummary: (v: unknown) => void;
    funcNameToNodeId: Record<string, string>;
    isGraphFullscreen: boolean; setIsGraphFullscreen: (v: boolean) => void;
    handleNodeClick: (node: GraphNode) => void;
    handleShowInGraph: (evidenceNodeIds: string[]) => void;

    // ── Timeline ──────────────────────────────────────────────────────────────
    timelineData: Record<string, unknown[]>;

    // ── Skills tab state ──────────────────────────────────────────────────────
    resultTab: ResultTab; setResultTab: (v: ResultTab) => void;
    handleTabChange: (tab: ResultTab) => void;
    skillSearch: string; setSkillSearch: (v: string) => void;
    skillFilter: "All" | "Verified" | "Partially Verified" | "Unverified" | "Not Assessed";
    setSkillFilter: (v: "All" | "Verified" | "Partially Verified" | "Unverified" | "Not Assessed") => void;
    expandAll: boolean | undefined; setExpandAll: (v: boolean | ((prev: boolean | undefined) => boolean)) => void;

    // ── Projects ──────────────────────────────────────────────────────────────
    projectResults: ProjectVerificationResult[] | null; setProjectResults: (v: ProjectVerificationResult[] | null) => void;
    projectSummary: ProjectSummaryData | null; setProjectSummary: (v: ProjectSummaryData | null) => void;
    isAnalyzingProjects: boolean;
    projectError: string | null; setProjectError: (v: string | null) => void;
    projectSearch: string; setProjectSearch: (v: string) => void;
    projectFilter: "All" | "Verified" | "Partially Verified" | "Unverified" | "Repo Not Ingested";
    setProjectFilter: (v: "All" | "Verified" | "Partially Verified" | "Unverified" | "Repo Not Ingested") => void;
    projectExpandAll: boolean | undefined; setProjectExpandAll: (v: boolean | ((prev: boolean | undefined) => boolean)) => void;
    reVerifyingProject: string | null;
    verifyStep: number;
    ingestedRepoMap: IngestedRepoRecord[];
    handleVerifyProjects: () => Promise<void>;
    handleSingleReVerify: (projectId: string, repoId: string) => Promise<void>;

    // ── Save / Share / Export ─────────────────────────────────────────────────
    isSaving: boolean; saveSuccess: boolean;
    shareToken: string | null;
    isSharing: boolean; shareCopied: boolean; setShareCopied: (v: boolean) => void;
    savedAnalysisId: string | null;
    handleSaveAnalysis: () => Promise<void>;
    handleShareAnalysis: () => Promise<void>;
    handleExportReport: () => Promise<void>;

    // ── Career Coach ──────────────────────────────────────────────────────────
    jobDescription: string; setJobDescription: (v: string) => void;
    isGeneratingPlan: boolean;
    bridgeProjects: BridgeProject[];
    gapSummary: string | null;
    activeBridgeTab: number; setActiveBridgeTab: (v: number) => void;
    showAllSteps: boolean; setShowAllSteps: (v: boolean) => void;
    numProjects: number; setNumProjects: (v: number) => void;
    coachError: string | null; setCoachError: (v: string | null) => void;
    coachFocused: boolean; setCoachFocused: (v: boolean) => void;
    heatmap: SkillsHeatmap | null;
    isGeneratingHeatmap: boolean;
    roadmap: Roadmap | null;
    isGeneratingRoadmap: boolean;
    hoursPerWeek: number; setHoursPerWeek: (v: number) => void;
    chatMessages: ChatMessage[]; setChatMessages: (v: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    isChatLoading: boolean;
    chatSuggestions: string[];
    isExportingCoach: boolean;
    focusedContext: { type: string | null; label: string; data?: Record<string, unknown> };
    previousSessionNotes: string;
    showMockInterview: boolean; setShowMockInterview: (v: boolean) => void;
    showTailoredResume: boolean; setShowTailoredResume: (v: boolean) => void;
    showApplicationKit: boolean; setShowApplicationKit: (v: boolean) => void;
    handleGenerateActionPlan: (jdOverride?: string) => Promise<void>;
    handleGenerateHeatmap: () => Promise<void>;
    handleGenerateRoadmap: () => Promise<void>;
    handleCoachChat: (message: string) => Promise<void>;
    handleExportCoachReport: () => Promise<void>;
    handleChatAction: (actions: ChatAction[]) => void;

    // ── ATS ───────────────────────────────────────────────────────────────────
    atsReport: ATSReport | null;
    atsReportHistory: ATSReport[];
    isScoring: boolean;
    atsError: string | null; setAtsError: (v: string | null) => void;
    handleGetATSScore: () => Promise<void>;

    // ── Assistant ─────────────────────────────────────────────────────────────
    assistantOpen: boolean; setAssistantOpen: (v: boolean) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard() {
    const ctx = useContext(DashboardContext);
    if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
    return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DashboardProvider({ children }: { children: ReactNode }) {
    // ── Resume / Repo state ───────────────────────────────────────────────────
    const [repoUrl, setRepoUrl] = useState("");
    const [repoId, setRepoId] = useState<string | null>(null);
    const [agentStatus, setAgentStatus] = useState<string | null>(null);
    const [agentMessages, setAgentMessages] = useState<string[]>([]);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfFileName, setPdfFileName] = useState<string | null>(null);
    const [extractedText, setExtractedText] = useState<string | null>(null);
    const [isIngesting, setIsIngesting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"cards" | "graph">("cards");
    const [resultTab, setResultTab] = useState<ResultTab>("skills");
    const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [graphRepoId, setGraphRepoId] = useState<string | null>(null);
    const [coachFocused, setCoachFocused] = useState(false);
    const [assistantOpen, setAssistantOpen] = useState(false);

    // ── GitHub state ──────────────────────────────────────────────────────────
    const [extractedRepos, setExtractedRepos] = useState<GitHubRepo[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const [githubUsername, setGithubUsername] = useState<string | null>(null);
    const [extractionError, setExtractionError] = useState<string | null>(null);
    const [isManualMode, setIsManualMode] = useState(false);
    const [linkedinUrl, setLinkedinUrl] = useState("");

    // ── Graph state ───────────────────────────────────────────────────────────
    const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
    const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
    const [isLoadingGraph, setIsLoadingGraph] = useState(false);
    const [graphMeta, setGraphMeta] = useState<Record<string, unknown> | null>(null);
    const [graphHighlightIds, setGraphHighlightIds] = useState<string[]>([]);
    const [funcNameToNodeId, setFuncNameToNodeId] = useState<Record<string, string>>({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [graphSummary, setGraphSummary] = useState<any>(null);

    // ── Coach state ───────────────────────────────────────────────────────────
    const [jobDescription, setJobDescription] = useState("");
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [bridgeProjects, setBridgeProjects] = useState<BridgeProject[]>([]);
    const [gapSummary, setGapSummary] = useState<string | null>(null);
    const [activeBridgeTab, setActiveBridgeTab] = useState(0);
    const [showAllSteps, setShowAllSteps] = useState(false);
    const [numProjects, setNumProjects] = useState(3);
    const [coachError, setCoachError] = useState<string | null>(null);
    const [heatmap, setHeatmap] = useState<SkillsHeatmap | null>(null);
    const [isGeneratingHeatmap, setIsGeneratingHeatmap] = useState(false);
    const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
    const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
    const [hoursPerWeek, setHoursPerWeek] = useState(10);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatSuggestions, setChatSuggestions] = useState<string[]>([
        "What should I focus on first?",
        "Can I finish this in 2 weeks?",
        "Best free resources for my top gap skill?",
    ]);
    const [isExportingCoach, setIsExportingCoach] = useState(false);
    const [focusedContext, setFocusedContext] = useState<{ type: string | null; label: string; data?: Record<string, unknown> }>({ type: "tab", label: "skills" });
    const [previousSessionNotes, setPreviousSessionNotes] = useState<string>("");
    const [showMockInterview, setShowMockInterview] = useState(false);
    const [showTailoredResume, setShowTailoredResume] = useState(false);
    const [showApplicationKit, setShowApplicationKit] = useState(false);

    // ── ATS state ─────────────────────────────────────────────────────────────
    const [atsReport, setAtsReport] = useState<ATSReport | null>(null);
    const [atsReportHistory, setAtsReportHistory] = useState<ATSReport[]>([]);
    const [isScoring, setIsScoring] = useState(false);
    const [atsError, setAtsError] = useState<string | null>(null);

    // ── Timeline state ────────────────────────────────────────────────────────
    const [timelineData, setTimelineData] = useState<Record<string, unknown[]>>({});

    // ── Multi-repo state ──────────────────────────────────────────────────────
    const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
    const [multiRepoIds, setMultiRepoIds] = useState<string[]>([]);

    // ── Save / Share state ────────────────────────────────────────────────────
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [shareToken, setShareToken] = useState<string | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null);

    // ── Skills tab state ──────────────────────────────────────────────────────
    const [skillSearch, setSkillSearch] = useState("");
    const [skillFilter, setSkillFilter] = useState<"All" | "Verified" | "Partially Verified" | "Unverified" | "Not Assessed">("All");
    const [expandAll, setExpandAll] = useState<boolean | undefined>(undefined);

    // ── Project state ─────────────────────────────────────────────────────────
    const [projectResults, setProjectResults] = useState<ProjectVerificationResult[] | null>(null);
    const [projectSummary, setProjectSummary] = useState<ProjectSummaryData | null>(null);
    const [isAnalyzingProjects, setIsAnalyzingProjects] = useState(false);
    const [projectError, setProjectError] = useState<string | null>(null);
    const [projectSearch, setProjectSearch] = useState("");
    const [projectFilter, setProjectFilter] = useState<"All" | "Verified" | "Partially Verified" | "Unverified" | "Repo Not Ingested">("All");
    const [projectExpandAll, setProjectExpandAll] = useState<boolean | undefined>(undefined);
    const [reVerifyingProject, setReVerifyingProject] = useState<string | null>(null);
    const [verifyStep, setVerifyStep] = useState(0);
    const [ingestedRepoMap, setIngestedRepoMap] = useState<IngestedRepoRecord[]>([]);

    // ── Score history ─────────────────────────────────────────────────────────
    const [prevScores, setPrevScores] = useState<Record<string, number>>(() => {
        try {
            const raw = typeof window !== "undefined" ? localStorage.getItem(PREV_SCORES_KEY) : null;
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    });

    // ─── Build name→nodeId map eagerly from graphNodes ────────────────────────
    useEffect(() => {
        if (graphNodes.length === 0) return;
        const map: Record<string, string> = {};
        graphNodes.forEach(n => {
            const nid = String(n.id);
            if (n.name) map[n.name] = nid;
            if (n.file_path) {
                map[n.file_path] = nid;
                const stem = n.file_path.split("/").pop()?.split(".")[0];
                if (stem) map[stem] = nid;
            }
        });
        setFuncNameToNodeId(map);
    }, [graphNodes]);

    // ─── Fetch graph data ─────────────────────────────────────────────────────
    const fetchGraphData = useCallback(async (rid: string) => {
        setIsLoadingGraph(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/graph/${rid}?limit=5000`);
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
            setGraphMeta(data.meta ?? null);
        } catch (err) {
            console.error("Graph fetch error:", err);
        } finally {
            setIsLoadingGraph(false);
        }
    }, []);

    // ─── Auto-fetch graph + timeline when graphRepoId changes ────────────────
    useEffect(() => {
        if (graphRepoId) fetchGraphData(graphRepoId);
        if (repoId) {
            fetch(`${API_BASE_URL}/api/skill-timeline/${repoId}`)
                .then(r => r.json())
                .then(d => setTimelineData(d.timeline || {}))
                .catch(() => setTimelineData({}));
        }
    }, [graphRepoId, repoId, fetchGraphData]);

    // ─── Cross-session memory ─────────────────────────────────────────────────
    useEffect(() => {
        if (!githubUsername) return;
        fetch(`${API_BASE_URL}/api/coach/memory/${encodeURIComponent(githubUsername)}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.memory) setPreviousSessionNotes(d.memory); })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [githubUsername]);

    // ─── Save memory on unload ────────────────────────────────────────────────
    useEffect(() => {
        const handleUnload = () => {
            if (!githubUsername || chatMessages.length < 2) return;
            const contextData = analysisResult ? {
                verified_skills: analysisResult.verification_results?.map((v: VerificationResult) => ({
                    topic: v.topic, score: v.score, status: v.status,
                })) ?? [],
                job_description: "",
            } : {};
            const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
            try {
                navigator.sendBeacon(
                    `${API_BASE_URL}/api/coach/memory/save`,
                    new Blob([JSON.stringify({ session_key: githubUsername, context_data: contextData, history })], { type: "application/json" })
                );
            } catch { /* non-blocking */ }
        };
        window.addEventListener("beforeunload", handleUnload);
        return () => window.removeEventListener("beforeunload", handleUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [githubUsername, chatMessages, analysisResult]);

    // ─── Fetch ingested repo registry ─────────────────────────────────────────
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/repos/ingested`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.repos) setIngestedRepoMap(d.repos); })
            .catch(() => {});
    }, []);

    // ─── Session Storage restore ──────────────────────────────────────────────
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
            if (d.atsReportHistory) setAtsReportHistory(d.atsReportHistory);
            if (d.pdfFileName)    setPdfFileName(d.pdfFileName);
            if (d.viewMode)       setViewMode(d.viewMode as "cards" | "graph");
            if (d.heatmap)        setHeatmap(d.heatmap);
            if (d.roadmap)        setRoadmap(d.roadmap);
            if (d.chatMessages?.length) setChatMessages(d.chatMessages);
            if (d.projectResults?.length) setProjectResults(d.projectResults);
            if (d.projectSummary) setProjectSummary(d.projectSummary);
        } catch { /* silently ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Session Storage save on state change ─────────────────────────────────
    useEffect(() => {
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                repoUrl, repoId, githubUsername, extractedRepos,
                selectedRepos: Array.from(selectedRepos),
                multiRepoIds, analysisResult, bridgeProjects, gapSummary,
                jobDescription, atsReport, atsReportHistory,
                pdfFileName: pdfFile?.name ?? pdfFileName,
                viewMode, heatmap, roadmap, chatMessages,
                projectResults, projectSummary,
            }));
        } catch { /* quota exceeded */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repoUrl, repoId, githubUsername, extractedRepos, selectedRepos,
        multiRepoIds, analysisResult, bridgeProjects, gapSummary,
        jobDescription, atsReport, atsReportHistory, pdfFile, pdfFileName, viewMode,
        heatmap, roadmap, chatMessages, projectResults, projectSummary]);

    // ─── Reset all ────────────────────────────────────────────────────────────
    const handleResetAll = useCallback(() => {
        sessionStorage.removeItem(SESSION_KEY);
        setRepoUrl(""); setRepoId(null); setGithubUsername(null);
        setExtractedRepos([]); setSelectedRepos(new Set()); setMultiRepoIds([]);
        setAnalysisResult(null); setGraphNodes([]); setGraphLinks([]);
        setBridgeProjects([]); setGapSummary(null); setJobDescription("");
        setAtsReport(null); setAtsReportHistory([]); setPdfFile(null); setPdfFileName(null);
        setTimelineData({}); setViewMode("cards"); setGraphRepoId(null);
        setError(null); setExtractionError(null); setCoachError(null);
        setAtsError(null); setAgentMessages([]); setAgentStatus(null);
        setIsManualMode(false);
        setHeatmap(null); setRoadmap(null); setChatMessages([]);
        setProjectResults(null); setProjectSummary(null); setProjectError(null);
        setProjectSearch(""); setProjectFilter("All");
    }, []);

    // ─── Toggle repo selection ────────────────────────────────────────────────
    const toggleRepoSelection = useCallback((url: string) => {
        setSelectedRepos(prev => {
            const next = new Set(prev);
            if (next.has(url)) next.delete(url); else next.add(url);
            return next;
        });
    }, []);

    // ─── Tab change ───────────────────────────────────────────────────────────
    const handleTabChange = useCallback((tab: ResultTab) => {
        setResultTab(tab);
        setFocusedContext({ type: "tab", label: tab });
    }, []);

    // ─── Chat action handler ──────────────────────────────────────────────────
    const handleGetATSScore = useCallback(async () => {
        if (!pdfFile && !extractedText) { setAtsError("Please upload your resume PDF first."); return; }
        if (!jobDescription.trim()) { setAtsError("Please paste a job description first."); return; }
        if (jobDescription.trim().split(/\s+/).length < 20) {
            setAtsError("Job description is too short. Please paste at least 20 words.");
            return;
        }
        // Save previous report to history before clearing
        setAtsReportHistory(prev => {
            if (!atsReport) return prev;
            return [atsReport, ...prev].slice(0, 3);
        });
        setIsScoring(true); setAtsError(null); setAtsReport(null);
        try {
            const formData = new FormData();
            // Prefer pre-extracted text to avoid re-uploading the full PDF
            if (extractedText) {
                formData.append("resume_text_override", extractedText);
            } else if (pdfFile) {
                formData.append("pdf_file", pdfFile);
            }
            formData.append("job_description", jobDescription);
            const res = await fetch(`${API_BASE_URL}/api/ats-score`, { method: "POST", body: formData });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: "ATS scoring failed" }));
                throw new Error(err.detail ?? "ATS scoring failed");
            }
            const data: ATSReport = await res.json();
            setAtsReport(data);
        } catch (e) {
            setAtsError(e instanceof Error ? e.message : "ATS scoring failed");
        } finally { setIsScoring(false); }
    }, [pdfFile, extractedText, jobDescription, atsReport]);

    const handleChatAction = useCallback((actions: ChatAction[]) => {
        for (const action of actions) {
            if (action.type === "switchTab") {
                setResultTab(action.tab as ResultTab);
                setFocusedContext({ type: "tab", label: action.tab });
            }
            if (action.type === "highlightNodes") {
                setGraphHighlightIds(action.nodeIds);
                setResultTab("graph");
            }
            if (action.type === "startMockInterview") {
                setShowMockInterview(true); setShowTailoredResume(false); setShowApplicationKit(false);
                setAssistantOpen(false);
            }
            if (action.type === "tailorResume") {
                setShowTailoredResume(true); setShowMockInterview(false); setShowApplicationKit(false);
                setAssistantOpen(false);
            }
            if (action.type === "showSalary") { setResultTab("skills"); }
            if (action.type === "generateApplicationKit") {
                setShowApplicationKit(true); setShowMockInterview(false); setShowTailoredResume(false);
                setAssistantOpen(false);
            }
            if (action.type === "runAtsScore") { handleGetATSScore(); }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleGetATSScore]);

    // ─── File upload ──────────────────────────────────────────────────────────
    const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === "application/pdf") {
            setPdfFile(file); setError(null);
            setIsExtracting(true); setExtractedRepos([]); setGithubUsername(null); setExtractionError(null);
            const profileFD = new FormData(); profileFD.append("pdf_file", file);
            const textFD = new FormData(); textFD.append("pdf_file", file);
            const [profileResult, textResult] = await Promise.allSettled([
                fetch(`${API_BASE_URL}/api/extract-profile`, { method: "POST", body: profileFD }),
                fetch(`${API_BASE_URL}/api/extract-resume-text`, { method: "POST", body: textFD }),
            ]);
            try {
                if (profileResult.status === "fulfilled" && profileResult.value.ok) {
                    const data = await profileResult.value.json();
                    setGithubUsername(data.username);
                    if (data.repos?.length > 0) { setExtractedRepos(data.repos); setIsManualMode(false); }
                    else { setExtractionError("GitHub profile found, but no public repositories available."); setIsManualMode(true); }
                } else {
                    const errData = profileResult.status === "fulfilled"
                        ? await profileResult.value.json().catch(() => ({})) : {};
                    setExtractionError(errData.detail || "Could not auto-detect GitHub profile.");
                    setIsManualMode(true);
                }
            } catch { setExtractionError("Failed to connect to extraction service."); setIsManualMode(true); }
            finally { setIsExtracting(false); }
            try {
                if (textResult.status === "fulfilled" && textResult.value.ok) {
                    const textData = await textResult.value.json();
                    setExtractedText(textData.text ?? null);
                }
            } catch { /* non-critical */ }
        } else { setError("Please upload a valid PDF file"); }
    }, []);

    // ─── Process SSE stream ───────────────────────────────────────────────────
    const processStreamResponse = useCallback(async (response: Response) => {
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
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (!dataStr) continue;
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.type === "progress") {
                            setAgentStatus(data.message); setAgentMessages(prev => [...prev, data.message]);
                        } else if (data.type === "complete") {
                            if (analysisResult?.verification_results?.length) {
                                const snap: Record<string, number> = {};
                                analysisResult.verification_results.forEach((v: VerificationResult) => { snap[v.topic] = v.score; });
                                setPrevScores(snap);
                                try { localStorage.setItem(PREV_SCORES_KEY, JSON.stringify(snap)); } catch { /* quota */ }
                            }
                            setAnalysisResult(data);
                        } else if (data.type === "error") { throw new Error(data.message || "Analysis failed"); }
                    } catch (e) {
                        if (e instanceof Error && e.message !== "SSE Parse error") throw e;
                    }
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysisResult]);

    // ─── Auto analyze ─────────────────────────────────────────────────────────
    const handleAutoAnalyze = useCallback(async (selectedRepoUrl: string) => {
        setRepoUrl(selectedRepoUrl); setIsIngesting(true); setError(null); setAgentMessages([]);
        try {
            const ingestResponse = await fetch(`${API_BASE_URL}/api/ingest`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ github_url: selectedRepoUrl }),
            });
            if (!ingestResponse.ok) {
                const errData = await ingestResponse.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to ingest repository");
            }
            const ingestData = await ingestResponse.json();
            const newRepoId = ingestData.repo_id;
            setRepoId(newRepoId); setGraphRepoId(newRepoId); setIsIngesting(false);
            if (!pdfFile) throw new Error("Resume PDF is missing");
            setIsAnalyzing(true); setAgentStatus("Starting analysis...");
            const formData = new FormData();
            formData.append("pdf_file", pdfFile); formData.append("repo_id", newRepoId);
            const analyzeResponse = await fetch(`${API_BASE_URL}/api/analyze?repo_id=${newRepoId}`, {
                method: "POST", body: formData,
            });
            await processStreamResponse(analyzeResponse);
        } catch (err) { setError(err instanceof Error ? err.message : "Auto-analysis failed"); }
        finally { setIsIngesting(false); setIsAnalyzing(false); }
    }, [pdfFile, processStreamResponse]);

    // ─── Ingest repo ──────────────────────────────────────────────────────────
    const handleIngestRepo = useCallback(async () => {
        if (!repoUrl) { setError("Please enter a GitHub repository URL"); return; }
        setIsIngesting(true); setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/api/ingest`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ github_url: repoUrl }),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || "Failed to ingest repository");
            }
            const data = await response.json();
            setRepoId(data.repo_id); setGraphRepoId(data.repo_id);
        } catch (err) { setError(err instanceof Error ? err.message : "Ingestion failed"); }
        finally { setIsIngesting(false); }
    }, [repoUrl]);

    // ─── Analyze resume ───────────────────────────────────────────────────────
    const handleAnalyze = useCallback(async () => {
        if (!pdfFile) { setError("Please upload a PDF resume first"); return; }
        if (!repoId) { setError("Please ingest a repository first"); return; }
        setIsAnalyzing(true); setAgentStatus("Starting analysis..."); setAgentMessages([]); setError(null);
        try {
            const formData = new FormData();
            formData.append("pdf_file", pdfFile); formData.append("repo_id", repoId);
            const response = await fetch(`${API_BASE_URL}/api/analyze?repo_id=${repoId}`, {
                method: "POST", body: formData,
            });
            await processStreamResponse(response);
        } catch (err) { setError(err instanceof Error ? err.message : "Analysis failed"); }
        finally { setIsAnalyzing(false); }
    }, [pdfFile, repoId, processStreamResponse]);

    // ─── Multi-repo analyze ───────────────────────────────────────────────────
    const handleMultiRepoAnalyze = useCallback(async () => {
        if (selectedRepos.size === 0) { setError("Please select at least one repository"); return; }
        if (!pdfFile) { setError("Please re-upload your resume PDF to run analysis"); return; }
        setIsIngesting(true); setError(null); setAgentMessages([]); setAnalysisResult(null);
        const urls = Array.from(selectedRepos);
        const ids: string[] = [];
        try {
            for (let i = 0; i < urls.length; i++) {
                const repoName = urls[i].split("/").pop() ?? urls[i];
                setAgentStatus(`Ingesting repo ${i + 1}/${urls.length}: ${repoName}`);
                setAgentMessages(prev => [...prev, `📦 Ingesting ${repoName}...`]);
                const res = await fetch(`${API_BASE_URL}/api/ingest`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
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
            setMultiRepoIds(ids); setRepoId(ids[0]); setIsIngesting(false);
            setGraphRepoId(ids.join(","));
            setIsAnalyzing(true); setIsAnalyzingProjects(true);
            setAgentStatus(`Analyzing ${ids.length} repo${ids.length > 1 ? "s" : ""}...`);
            setAgentMessages(prev => [...prev, `🔍 Running skills + project analysis in parallel on ${ids.length} repo${ids.length > 1 ? "s" : ""}...`]);
            const skillsForm = new FormData();
            skillsForm.append("pdf_file", pdfFile); skillsForm.append("repo_ids", JSON.stringify(ids));
            const projectsForm = new FormData();
            projectsForm.append("pdf_file", pdfFile); projectsForm.append("repo_ids", JSON.stringify(ids));
            const [skillsRes, projectsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/analyze/multi`, { method: "POST", body: skillsForm }),
                fetch(`${API_BASE_URL}/api/analyze/projects`, { method: "POST", body: projectsForm }),
            ]);
            if (!skillsRes.ok) {
                const e = await skillsRes.json().catch(() => ({}));
                throw new Error(e.detail || "Multi-repo analysis failed");
            }
            const result = await skillsRes.json();
            const hasResults = (result.verification_results?.length ?? 0) > 0;
            const backendErrors: string[] = result.errors ?? [];
            const rateLimitError = backendErrors.find((e: string) => e.includes("429") || e.includes("rate limit") || e.includes("rate_limit"));
            if (!hasResults && rateLimitError) {
                setError("⚠️ AI rate limit reached — the free Groq API quota (100k tokens/day) has been exhausted. Please wait 15-60 minutes and try again, or upgrade to Groq Dev tier.");
                setAgentMessages(prev => [...prev, `⚠️ Rate limit: ${rateLimitError}`]);
                setIsAnalyzing(false); setIsAnalyzingProjects(false); return;
            }
            if (!hasResults && backendErrors.length > 0) {
                setError(`Analysis returned 0 claims: ${backendErrors[0]}`);
                setIsAnalyzing(false); setIsAnalyzingProjects(false); return;
            }
            if (analysisResult?.verification_results?.length) {
                const snap: Record<string, number> = {};
                analysisResult.verification_results.forEach(v => { snap[v.topic] = v.score; });
                setPrevScores(snap);
                try { localStorage.setItem(PREV_SCORES_KEY, JSON.stringify(snap)); } catch { /* quota */ }
            }
            setAnalysisResult(result);
            setAgentMessages(prev => [...prev, `✨ Skills analysis complete! ${result.verification_results?.length ?? 0} skills verified.`]);
            setAgentStatus(null); setIsAnalyzing(false);
            if (projectsRes.ok) {
                const projectData = await projectsRes.json();
                setProjectResults(projectData.projects ?? []);
                setProjectSummary(projectData.summary ?? null);
                setAgentMessages(prev => [...prev, `📁 Project verification complete! ${projectData.projects?.length ?? 0} projects verified.`]);
            } else {
                const e = await projectsRes.json().catch(() => ({}));
                setProjectError(e.detail || "Project verification failed");
            }
            setIsAnalyzingProjects(false);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg || "Analysis failed — check browser console for details");
            setAgentMessages(prev => [...prev, `❌ Analysis error: ${msg}`]);
        } finally { setIsIngesting(false); setIsAnalyzing(false); setIsAnalyzingProjects(false); }
    }, [selectedRepos, pdfFile, analysisResult]);

    // ─── Project verification ─────────────────────────────────────────────────
    const handleVerifyProjects = useCallback(async () => {
        if (!pdfFile) { setProjectError("Please upload your resume PDF first."); return; }
        const ids = multiRepoIds.length > 0 ? multiRepoIds : (repoId ? [repoId] : []);
        if (ids.length === 0) { setProjectError("No ingested repositories found. Please analyse your resume first."); return; }
        setIsAnalyzingProjects(true); setProjectError(null); setProjectResults(null);
        setProjectSummary(null); setVerifyStep(0);
        const stepTimer = setInterval(() => setVerifyStep(s => (s + 1) % VERIFY_STEPS.length), 2500);
        try {
            const formData = new FormData();
            formData.append("pdf_file", pdfFile); formData.append("repo_ids", JSON.stringify(ids));
            const res = await fetch(`${API_BASE_URL}/api/analyze/projects`, { method: "POST", body: formData });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e.detail || `Project verification failed (${res.status})`);
            }
            const data = await res.json();
            setProjectResults(data.projects ?? []); setProjectSummary(data.summary ?? null);
        } catch (err) { setProjectError(err instanceof Error ? err.message : "Project verification failed"); }
        finally { clearInterval(stepTimer); setIsAnalyzingProjects(false); }
    }, [pdfFile, multiRepoIds, repoId]);

    // ─── Single project re-verify ─────────────────────────────────────────────
    const handleSingleReVerify = useCallback(async (projectId: string, repoId: string) => {
        if (!projectResults) return;
        const project = projectResults.find(p => p.project_id === projectId);
        if (!project) return;
        setReVerifyingProject(projectId);
        try {
            const projectClaim = {
                project_id: project.project_id, name: project.name, tech_stack: project.tech_stack,
                github_url: "", bullet_claims: project.bullet_verdicts.map((v: { claim: string }) => v.claim),
            };
            const res = await fetch(`${API_BASE_URL}/api/analyze/projects/single`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_claim: projectClaim, repo_id: repoId }),
            });
            if (!res.ok) throw new Error("Re-verification failed");
            const updated = await res.json();
            setProjectResults(prev => prev?.map(p => p.project_id === projectId ? updated : p) ?? [updated]);
        } catch (err) { console.error("Re-verify error:", err); }
        finally { setReVerifyingProject(null); }
    }, [projectResults]);

    // ─── Export report ────────────────────────────────────────────────────────
    const handleExportReport = useCallback(async () => {
        if (!analysisResult) return;
        try {
            const repoNames = extractedRepos.filter(r => selectedRepos.has(r.html_url)).map(r => r.name);
            const response = await fetch(`${API_BASE_URL}/api/export-report`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidate_name: githubUsername || "Candidate",
                    repo_names: repoNames.length ? repoNames : (analysisResult.repo_id ? [analysisResult.repo_id] : ["Unknown"]),
                    skills: analysisResult.verification_results?.map(v => ({
                        topic: v.topic, score: v.score, status: v.status,
                        evidence: v.reasoning, complexity_analysis: v.complexity_analysis,
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
            const a = document.createElement("a"); a.href = url;
            a.download = `trueskill_report_${(githubUsername || "candidate").replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.html`;
            a.click(); URL.revokeObjectURL(url);
        } catch (err) { console.error("Export failed:", err); }
    }, [analysisResult, githubUsername, extractedRepos, selectedRepos, bridgeProjects, atsReport]);

    // ─── Save analysis ────────────────────────────────────────────────────────
    const handleSaveAnalysis = useCallback(async () => {
        if (!analysisResult) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/analyses`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidate_name: githubUsername || "Candidate",
                    repo_names: extractedRepos.filter(r => selectedRepos.has(r.html_url)).map(r => r.name),
                    repo_ids: multiRepoIds, results: analysisResult,
                    skills: analysisResult.verification_results?.map(v => ({ topic: v.topic, score: v.score, status: v.status, evidence: v.reasoning })) || [],
                    overall_score: analysisResult.summary?.average_score || 0,
                }),
            });
            const data = await res.json();
            if (data.analysis_id) setSavedAnalysisId(data.analysis_id);
            setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) { console.error("Save failed:", err); }
        finally { setIsSaving(false); }
    }, [analysisResult, githubUsername, extractedRepos, selectedRepos, multiRepoIds]);

    // ─── Share analysis ───────────────────────────────────────────────────────
    const handleShareAnalysis = useCallback(async () => {
        if (!analysisResult) return;
        setIsSharing(true); setError(null);
        try {
            let aid = savedAnalysisId;
            if (!aid) {
                const res = await fetch(`${API_BASE_URL}/api/analyses`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        candidate_name: githubUsername || "Candidate",
                        repo_names: extractedRepos.filter(r => selectedRepos.has(r.html_url)).map(r => r.name),
                        repo_ids: multiRepoIds, results: analysisResult,
                        skills: analysisResult.verification_results?.map(v => ({ topic: v.topic, score: v.score, status: v.status, evidence: v.reasoning })) || [],
                        overall_score: analysisResult.summary?.average_score || 0,
                    }),
                });
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    throw new Error(errBody.detail || `Save failed (${res.status})`);
                }
                const saved = await res.json();
                aid = saved.analysis_id;
                if (aid) setSavedAnalysisId(aid);
            }
            if (!aid) throw new Error("Could not save analysis — no ID returned");
            const shareRes = await fetch(`${API_BASE_URL}/api/analyses/${aid}/share`, { method: "POST" });
            if (!shareRes.ok) {
                const errBody = await shareRes.json().catch(() => ({}));
                throw new Error(errBody.detail || `Share failed (${shareRes.status})`);
            }
            const shareData = await shareRes.json();
            setShareToken(shareData.share_token);
            const url = `${window.location.origin}/profile/${shareData.share_token}`;
            navigator.clipboard.writeText(url).then(() => {
                setShareCopied(true); setTimeout(() => setShareCopied(false), 2500);
            }).catch(() => {});
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            console.error("Share failed:", err); setError(`Share failed: ${msg}`);
        } finally { setIsSharing(false); }
    }, [analysisResult, savedAnalysisId, githubUsername, extractedRepos, selectedRepos, multiRepoIds]);

    // ─── Show in graph ────────────────────────────────────────────────────────
    const handleShowInGraph = useCallback((evidenceNodeIds: string[]) => {
        const nodeIds = evidenceNodeIds.flatMap(eid => {
            const funcName = eid.includes(":") ? eid.split(":").pop()?.trim() ?? "" : eid;
            const nid1 = funcNameToNodeId[funcName]; if (nid1) return [nid1];
            const nid2 = funcNameToNodeId[eid]; if (nid2) return [nid2];
            const stem = eid.split("/").pop()?.split(".")[0] ?? "";
            const nid3 = stem ? funcNameToNodeId[stem] : undefined; if (nid3) return [nid3];
            return [];
        });
        setGraphHighlightIds(nodeIds);
        if (nodeIds.length > 0) setResultTab("graph");
    }, [funcNameToNodeId]);

    const handleNodeClick = useCallback((node: GraphNode) => { console.log("Node clicked:", node); }, []);

    // ─── Generate action plan ─────────────────────────────────────────────────
    const handleGenerateActionPlan = useCallback(async (jdOverride?: string) => {
        const jd = jdOverride ?? jobDescription;
        if (!jd.trim()) { setCoachError("Please enter a job description"); return; }
        if (!analysisResult?.verification_results.length) { setCoachError("Please analyze a resume first to get verified skills"); return; }
        setIsGeneratingPlan(true); setCoachError(null);
        try {
            const verifiedSkills = analysisResult.verification_results.map(r => ({ topic: r.topic, score: r.score, status: r.status }));
            const response = await fetch(`${API_BASE_URL}/api/coach`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ verified_skills: verifiedSkills, job_description: jd, num_projects: numProjects }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to generate action plan");
            }
            const data = await response.json();
            const projects: BridgeProject[] = data.bridge_projects ?? (data.bridge_project ? [data.bridge_project] : []);
            setBridgeProjects(projects); setGapSummary(data.gap_analysis_summary ?? null);
            setActiveBridgeTab(0); setShowAllSteps(false);
        } catch (err) { setCoachError(err instanceof Error ? err.message : "Failed to generate plan"); }
        finally { setIsGeneratingPlan(false); }
    }, [jobDescription, analysisResult, numProjects]);

    // ─── Generate heatmap ─────────────────────────────────────────────────────
    const handleGenerateHeatmap = useCallback(async () => {
        if (!analysisResult?.verification_results.length || !jobDescription.trim()) return;
        setIsGeneratingHeatmap(true);
        try {
            const verifiedSkills = analysisResult.verification_results.map(r => ({ topic: r.topic, score: r.score, status: r.status }));
            const response = await fetch(`${API_BASE_URL}/api/coach/heatmap`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ verified_skills: verifiedSkills, job_description: jobDescription, ats_keyword_matches: atsReport?.keyword_matches ?? null }),
            });
            if (!response.ok) throw new Error("Heatmap generation failed");
            const data = await response.json(); setHeatmap(data);
        } catch (err) { console.error("Heatmap error:", err); }
        finally { setIsGeneratingHeatmap(false); }
    }, [analysisResult, jobDescription, atsReport]);

    // ─── Generate roadmap ─────────────────────────────────────────────────────
    const handleGenerateRoadmap = useCallback(async () => {
        if (!bridgeProjects.length) return;
        setIsGeneratingRoadmap(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/coach/roadmap`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bridge_projects: bridgeProjects, gap_summary: gapSummary ?? "", job_description: jobDescription, hours_per_week: hoursPerWeek }),
            });
            if (!response.ok) throw new Error("Roadmap generation failed");
            const data = await response.json(); setRoadmap(data);
        } catch (err) { console.error("Roadmap error:", err); }
        finally { setIsGeneratingRoadmap(false); }
    }, [bridgeProjects, gapSummary, jobDescription, hoursPerWeek]);

    // ─── Coach chat ───────────────────────────────────────────────────────────
    const handleCoachChat = useCallback(async (message: string) => {
        const userMsg: ChatMessage = { role: "user", content: message, timestamp: Date.now() };
        setChatMessages(prev => [...prev, userMsg]); setIsChatLoading(true);
        const context_data = {
            verified_skills: analysisResult?.verification_results?.map(r => ({ topic: r.topic, score: r.score, status: r.status })) ?? [],
            bridge_projects: bridgeProjects, gap_summary: gapSummary ?? "", roadmap: roadmap ?? null, job_description: jobDescription,
        };
        const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
        const streamingMsg: ChatMessage = { role: "assistant", content: "", timestamp: Date.now(), streaming: true };
        setChatMessages(prev => [...prev, streamingMsg]);
        try {
            const response = await fetch(`${API_BASE_URL}/api/coach/chat/stream`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message, context_data, history, ats_report: atsReport ?? null,
                    forensics: analysisResult?.forensics ?? null,
                    project_results: projectResults?.map(p => ({
                        name: p.name, status: p.status, overall_score: p.overall_score,
                        tech_found_count: p.tech_found_count ?? p.tech_coverage?.filter(t => t.found).length ?? 0,
                        tech_total_count: p.tech_total_count ?? p.tech_coverage?.length ?? 0, bullet_verdicts: p.bullet_verdicts ?? [],
                    })) ?? null,
                    graph_metadata: graphMeta ? {
                        node_count: (graphMeta as Record<string, unknown>).node_count ?? graphNodes.length,
                        edge_count: (graphMeta as Record<string, unknown>).edge_count ?? graphLinks.length,
                        type_counts: (graphMeta as Record<string, unknown>).type_counts ?? {},
                        top_complex: (graphMeta as Record<string, unknown>).top_complex ?? [],
                        architecture_style: graphSummary?.architecture_style ?? "",
                    } : null,
                    current_tab: resultTab, candidate_name: githubUsername ?? "Candidate",
                    focused_on: focusedContext.type ? focusedContext : null,
                    previous_session_notes: previousSessionNotes || null,
                }),
            });
            if (!response.ok || !response.body) throw new Error("Stream failed");
            const reader = response.body.getReader(); const decoder = new TextDecoder(); let accumulated = "";
            while (true) {
                const { done, value } = await reader.read(); if (done) break;
                const text = decoder.decode(value, { stream: true }); const lines = text.split("\n");
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const jsonStr = line.slice(6).trim(); if (!jsonStr) continue;
                    try {
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.token !== undefined) {
                            accumulated += parsed.token;
                            setChatMessages(prev => { const next = [...prev]; next[next.length - 1] = { ...next[next.length - 1], content: accumulated, streaming: true }; return next; });
                        }
                        if (parsed.done) {
                            const finalContent = parsed.final_text ?? accumulated.replace(/<!--[\s\S]*?-->/g, "").trim();
                            if (Array.isArray(parsed.actions) && parsed.actions.length > 0) handleChatAction(parsed.actions as ChatAction[]);
                            if (parsed.action_prompt) {
                                setChatMessages(prev => { const next = [...prev]; next[next.length - 1] = { ...next[next.length - 1], content: finalContent, streaming: false, actionPrompt: parsed.action_prompt }; return next; });
                            } else {
                                setChatMessages(prev => { const next = [...prev]; next[next.length - 1] = { ...next[next.length - 1], content: finalContent, streaming: false }; return next; });
                            }
                            if (Array.isArray(parsed.suggestions)) setChatSuggestions(parsed.suggestions);
                        }
                    } catch { /* ignore parse errors */ }
                }
            }
        } catch (err) {
            console.error("Coach chat stream error:", err);
            setChatMessages(prev => { const next = [...prev]; next[next.length - 1] = { ...next[next.length - 1], content: "Sorry, I couldn't process that. Please try again.", streaming: false }; return next; });
        } finally { setIsChatLoading(false); setChatMessages(prev => prev.map(m => ({ ...m, streaming: false }))); }
    }, [chatMessages, bridgeProjects, gapSummary, jobDescription, roadmap, analysisResult,
        atsReport, projectResults, graphMeta, graphNodes.length, graphLinks.length,
        graphSummary, resultTab, githubUsername, handleChatAction, focusedContext, previousSessionNotes]);

    // ─── Export coach report ──────────────────────────────────────────────────
    const handleExportCoachReport = useCallback(async () => {
        if (!bridgeProjects.length) return;
        setIsExportingCoach(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/coach/export`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ candidate_name: githubUsername || "Candidate", gap_summary: gapSummary ?? "", bridge_projects: bridgeProjects, heatmap: heatmap ?? null, roadmap: roadmap ?? null }),
            });
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url;
            a.download = `coach_report_${(githubUsername || "candidate").replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.html`;
            a.click(); URL.revokeObjectURL(url);
        } catch (err) { console.error("Coach export error:", err); }
        finally { setIsExportingCoach(false); }
    }, [bridgeProjects, gapSummary, heatmap, roadmap, githubUsername]);

    // ─── Proactive insights ───────────────────────────────────────────────────
    const proactiveInsightsFired = useRef(false);
    useEffect(() => {
        if (!analysisResult || proactiveInsightsFired.current) return;
        proactiveInsightsFired.current = true;
        setTimeout(async () => {
            setAssistantOpen(true); setIsChatLoading(true);
            const proactiveMsg: ChatMessage = { role: "assistant", content: "", timestamp: Date.now(), streaming: true, isProactive: true };
            setChatMessages([proactiveMsg]);
            try {
                const context_data = {
                    verified_skills: analysisResult.verification_results?.map(r => ({ topic: r.topic, score: r.score, status: r.status })) ?? [],
                    forensics: analysisResult.forensics ?? null, candidate_name: githubUsername ?? "Candidate",
                    ats_report: atsReport ?? null, project_results: projectResults ?? null,
                };
                const res = await fetch(`${API_BASE_URL}/api/coach/insights`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ context_data }),
                });
                const { insight } = await res.json();
                setChatMessages([{ role: "assistant", content: insight, timestamp: Date.now(), streaming: false, isProactive: true }]);
            } catch { setChatMessages([]); }
            finally { setIsChatLoading(false); }
        }, 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysisResult]);

    // ─── Context value ────────────────────────────────────────────────────────
    const value: DashboardContextValue = {
        repoUrl, setRepoUrl, repoId, setRepoId,
        pdfFile, setPdfFile, pdfFileName, setPdfFileName, extractedText,
        isDragging, setIsDragging,
        extractedRepos, githubUsername, isExtracting, extractionError,
        isManualMode, setIsManualMode, selectedRepos, setSelectedRepos, toggleRepoSelection,
        linkedinUrl, setLinkedinUrl,
        isIngesting, isAnalyzing, agentStatus, agentMessages, error, setError,
        multiRepoIds, graphRepoId,
        handleFileUpload, handleIngestRepo, handleAnalyze, handleMultiRepoAnalyze,
        handleAutoAnalyze, handleResetAll,
        analysisResult, prevScores, viewMode, setViewMode,
        graphNodes, graphLinks, isLoadingGraph, graphMeta, graphHighlightIds, setGraphHighlightIds,
        graphSummary, setGraphSummary, funcNameToNodeId, isGraphFullscreen, setIsGraphFullscreen,
        handleNodeClick, handleShowInGraph, timelineData,
        resultTab, setResultTab, handleTabChange, skillSearch, setSkillSearch,
        skillFilter, setSkillFilter, expandAll, setExpandAll,
        projectResults, setProjectResults, projectSummary, setProjectSummary,
        isAnalyzingProjects, projectError, setProjectError,
        projectSearch, setProjectSearch, projectFilter, setProjectFilter,
        projectExpandAll, setProjectExpandAll, reVerifyingProject, verifyStep,
        ingestedRepoMap, handleVerifyProjects, handleSingleReVerify,
        isSaving, saveSuccess, shareToken, isSharing, shareCopied, setShareCopied,
        savedAnalysisId, handleSaveAnalysis, handleShareAnalysis, handleExportReport,
        jobDescription, setJobDescription, isGeneratingPlan, bridgeProjects, gapSummary,
        activeBridgeTab, setActiveBridgeTab, showAllSteps, setShowAllSteps,
        numProjects, setNumProjects, coachError, setCoachError,
        coachFocused, setCoachFocused,
        heatmap, isGeneratingHeatmap, roadmap, isGeneratingRoadmap,
        hoursPerWeek, setHoursPerWeek, chatMessages, setChatMessages,
        isChatLoading, chatSuggestions, isExportingCoach,
        focusedContext, previousSessionNotes,
        showMockInterview, setShowMockInterview,
        showTailoredResume, setShowTailoredResume,
        showApplicationKit, setShowApplicationKit,
        handleGenerateActionPlan, handleGenerateHeatmap, handleGenerateRoadmap,
        handleCoachChat, handleExportCoachReport, handleChatAction,
        atsReport, atsReportHistory, isScoring, atsError, setAtsError, handleGetATSScore,
        assistantOpen, setAssistantOpen,
    };

    return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
