// ─── Shared Dashboard Types ───────────────────────────────────────────────────

export interface GitHubRepo {
    name: string;
    html_url: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    updated_at: string;
}

export interface VerificationResult {
    claim_id: string;
    topic: string;
    claim_text: string;
    status: "Verified" | "Partially Verified" | "Unverified" | "Not Code-Verifiable" | "Repo Not Available";
    score: number;
    evidence_node_ids: string[];
    reasoning: string;
    complexity_analysis: string;
    score_breakdown?: {
        evidence_base: number;
        node_bonus: number;
        complexity: number;
        llm: number;
    };
}

export interface ForensicsData {
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

export interface AnalysisResponse {
    status: string;
    repo_id: string;
    claims_extracted: number;
    claims: Array<{
        id: string;
        topic: string;
        claim_text: string;
        difficulty: number;
        claim_type?: "code_verifiable" | "not_code_verifiable";
    }>;
    verification_results: VerificationResult[];
    summary: {
        verified: number;
        partially_verified: number;
        unverified: number;
        not_assessed: number;
        total_claims: number;
        average_score: number;
    };
    errors: string[];
    authenticity_score?: number | null;
    forensics?: ForensicsData;
}

export interface BridgeProject {
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

export interface HeatmapRow {
    skill: string;
    category: string;
    verified_score: number;
    ats_found: boolean;
    gap_severity: "None" | "Minor" | "Moderate" | "Critical";
    recommendation: string;
}

export interface SkillsHeatmap {
    rows: HeatmapRow[];
    overall_match_pct: number;
    critical_count: number;
    moderate_count: number;
}

export interface RoadmapWeek {
    week: number;
    focus_skill: string;
    tasks: string[];
    milestone: string;
    hours_required: number;
}

export interface Roadmap {
    weeks: RoadmapWeek[];
    total_weeks: number;
    total_hours: number;
    readiness_date: string;
}

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    streaming?: boolean;
    isProactive?: boolean;
    reaction?: "up" | "down" | null;
    actionPrompt?: { label: string; description: string; action: string };
}

export interface ATSKeywordMatch {
    keyword: string;
    found: boolean;
    context: string;
}

export interface ATSSectionFeedback {
    section: string;
    score: number;
    feedback: string;
    suggestions: string[];
}

export interface ATSPriorityAction {
    rank: number;
    action: string;
    impact: string;
    estimated_gain: number;
    section: string;
}

export interface ATSRewriteSuggestion {
    section: string;
    original_snippet: string;
    rewritten_snippet: string;
    rationale: string;
}

export interface ATSReport {
    ats_score: number;
    keyword_match_score: number;
    format_score: number;
    content_score: number;
    experience_match_score: number;
    job_title: string;
    company_name: string;
    match_level: string;
    keyword_matches: ATSKeywordMatch[];
    section_feedback: ATSSectionFeedback[];
    top_missing_keywords: string[];
    formatting_flags: string[];
    overall_recommendation: string;
    strengths: string[];
    improvements: string[];
    priority_actions: ATSPriorityAction[];
    rewrite_suggestions: ATSRewriteSuggestion[];
}

export interface IngestedRepoRecord {
    repo_id: string;
    repo_name: string;
    github_url: string;
    owner: string;
    ingested_at: string;
}

export type ChatAction =
    | { type: "switchTab"; tab: string }
    | { type: "highlightNodes"; nodeIds: string[] }
    | { type: "startMockInterview" }
    | { type: "tailorResume" }
    | { type: "showSalary" }
    | { type: "generateApplicationKit" }
    | { type: "runAtsScore" };

export type ViewMode = "cards" | "graph";
export type ResultTab = "skills" | "radar" | "activity" | "graph" | "projects";

export interface ContextStatus {
    skills: boolean;
    bridge_projects: boolean;
    roadmap: boolean;
    ats: boolean;
}
