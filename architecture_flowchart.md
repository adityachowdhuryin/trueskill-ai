# TrueSkill AI: System Architecture Flowchart

Below is the Mermaid flowchart visualizing the data flow and layer interactions in **TrueSkill AI: Automated Competency Verification System**.

```mermaid
flowchart TD
    subgraph Input_Layer ["User Input Layer"]
        ResumePDF["Candidate Resume (PDF)"]
        GitHubURL["GitHub Repository URL"]
        JobDesc["Job Description (JD) / URL"]
    end

    subgraph Ingestion_Layer ["Ingestion & Parsing Layer"]
        VLM_Parser["Gemini Flash VLM Parser"]
        AST_Ingest["tree-sitter Ingestion Engine<br>(Python, JS, TS, Go, Java, Rust)"]
        ATS_Engine["ATS Keyword & Format Scorer"]
        Neo4jDB[("Neo4j AuraDB Cloud Graph")]
        ResumeText["Extracted Resume JSON"]
    end

    subgraph Reasoning_Layer ["Reasoning Layer (LangGraph Council of Agents)"]
        ParserNode["Parser Agent Node<br>(Claim Deduplication & Cap <=20)"]
        AuditorNode["Auditor Agent Node<br>(3-Layer Cypher Query Translation &<br>110+ Library Alias Mapping)"]
        GraderNode["Grader Agent Node<br>(100-Pt Rubric: Evidence + Node Bonus +<br>Depth + LLM Audit)"]
    end

    subgraph Storage_Layer ["Storage & Cache Layer"]
        SQLiteDB[("SQLite Database<br>(trueskill_analyses.db)")]
        LocalCache["Local JSON Cache<br>(memories.json & feedback.jsonl)"]
    end

    subgraph Output_Layer ["Output & Co-Pilot Layer"]
        dashboard["Verification Dashboard<br>(SVG Donut, SVG Score Gauges)"]
        Graph3D["3D Knowledge Graph cockpit<br>(react-force-graph-3d, Three.js, Bloom)"]
        AlexChat["Alex AI Career Co-Pilot<br>(SSE-Streaming, Focused Screen Awareness,<br>Capability Cards, Suggestion Bank)"]
        MockInt["Mock Interview System<br>(Calibrated Questions & Grading)"]
        AtsReport["ATS Feedback Report<br>(KW Match + Content + Format)"]
        ProjectDeep["Project Deep Dive (5-Tabs)<br>(Scorecard, Summaries, Tech Debt,<br>Skill Signals, Recruiter Pitch)"]
    end

    %% Data Flow Connections
    ResumePDF --> VLM_Parser
    ResumePDF --> ATS_Engine
    JobDesc --> ATS_Engine
    GitHubURL --> AST_Ingest
    
    VLM_Parser --> ResumeText
    AST_Ingest --> Neo4jDB
    
    ResumeText --> ParserNode
    ParserNode --> AuditorNode
    Neo4jDB <--> AuditorNode
    AuditorNode --> GraderNode
    
    GraderNode --> SQLiteDB
    
    SQLiteDB --> dashboard
    Neo4jDB --> Graph3D
    
    dashboard --> Graph3D
    dashboard --> ProjectDeep
    ATS_Engine --> AtsReport
    
    %% Alex interaction
    dashboard <--> AlexChat
    SQLiteDB <--> LocalCache
    LocalCache <--> AlexChat
    AlexChat --> MockInt
    AlexChat --> AtsReport
    
    %% Style formatting
    style Input_Layer fill:#F7FAFC,stroke:#CBD5E0,stroke-width:2px;
    style Ingestion_Layer fill:#EDF2F7,stroke:#A0AEC0,stroke-width:2px;
    style Reasoning_Layer fill:#E2E8F0,stroke:#718096,stroke-width:2px;
    style Storage_Layer fill:#EDF2F7,stroke:#A0AEC0,stroke-width:2px;
    style Output_Layer fill:#EBF8FF,stroke:#4299E1,stroke-width:2px;
    style Neo4jDB fill:#C6F6D5,stroke:#38A169,stroke-width:2px;
    style SQLiteDB fill:#FEEBC8,stroke:#DD6B20,stroke-width:2px;
```

### Flow Walkthrough

1. **User Input:** The candidate uploads their double-column PDF resume and GitHub repository URL. If matching against a role, a Job Description (or URL) is also provided.
2. **Ingestion Processing:** 
   - The PDF is parsed via a Gemini Vision-Language Model to extract clean claim blocks (mapped by topic, difficulty, and libraries).
   - The codebase is parsed by `tree-sitter` to construct an Abstract Syntax Tree (AST) stored in `Neo4j AuraDB`.
3. **Multi-Agent Audit:** Orchestrated via `LangGraph` in a 3-agent pipeline (Parser $\rightarrow$ Auditor $\rightarrow$ Grader). The Auditor translates natural language resume claims into Cypher queries, resolving library aliases. The Grader audits complexity and applies a 100-point rubric.
4. **Co-Pilot and Output:** The SQLite database stores candidate profiles and comparative scoring. The Next.js frontend renders an SVG verification dashboard, an interactive 3D Force-Directed Graph, the 5-tab Project Deep Dive panel, and **Alex**—the SSE-streaming AI career coach that triggers mock interviews, salary intelligence, resume tailoring, and email drafts.
