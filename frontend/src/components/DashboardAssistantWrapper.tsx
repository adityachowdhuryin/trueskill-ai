"use client";

import dynamic from "next/dynamic";
import { useDashboard } from "@/contexts/DashboardContext";

// Both must be at module level — never inside a component body
const TrueSkillAssistant = dynamic(() => import("@/components/TrueSkillAssistant"), { ssr: false });
const GraphFullscreenModal = dynamic(() => import("@/components/GraphFullscreenModal"), { ssr: false });

export default function DashboardAssistantWrapper() {
    const {
        chatMessages, isChatLoading, handleCoachChat, chatSuggestions,
        handleChatAction, setChatMessages, githubUsername,
        assistantOpen, setAssistantOpen,
        analysisResult, atsReport, projectResults, graphNodes,
        graphLinks, handleNodeClick, isLoadingGraph,
        graphMeta, multiRepoIds, isGraphFullscreen, setIsGraphFullscreen,
        roadmap,
    } = useDashboard();

    return (
        <>
            <TrueSkillAssistant
                messages={chatMessages}
                isLoading={isChatLoading}
                onSend={handleCoachChat}
                suggestions={chatSuggestions}
                onAction={handleChatAction}
                onClear={() => setChatMessages([])}
                candidateName={githubUsername ?? undefined}
                apiBase={process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
                isOpen={assistantOpen}
                onOpenChange={setAssistantOpen}
                contextStatus={{
                    skills: (analysisResult?.verification_results?.length ?? 0) > 0,
                    ats: !!atsReport,
                    projects: (projectResults?.length ?? 0) > 0,
                    graph: graphNodes.length > 0,
                    roadmap: !!roadmap,
                }}
            />
            {isGraphFullscreen && (
                <GraphFullscreenModal
                    nodes={graphNodes}
                    links={graphLinks}
                    onClose={() => setIsGraphFullscreen(false)}
                    onNodeClick={handleNodeClick}
                    isLoading={isLoadingGraph}
                    graphMeta={graphMeta}
                    repoIds={multiRepoIds}
                />
            )}
        </>
    );
}
