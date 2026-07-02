import { DashboardProvider } from "@/contexts/DashboardContext";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardAssistantWrapper from "@/components/DashboardAssistantWrapper";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "TrueSkill AI — Dashboard",
    description: "Verify your resume skills against real code. Get AI-powered career coaching, ATS scoring, and project analysis.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <DashboardProvider>
            <div className="flex h-screen overflow-hidden bg-slate-50">
                {/* Sidebar */}
                <DashboardSidebar />

                {/* Main content area */}
                <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
                    {children}
                </div>
            </div>

            {/* Global floating assistant — persists across all sub-pages */}
            <DashboardAssistantWrapper />
        </DashboardProvider>
    );
}
