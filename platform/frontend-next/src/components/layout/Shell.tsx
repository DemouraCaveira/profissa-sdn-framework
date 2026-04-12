import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-0 text-fg-0">
      <Sidebar />
      <div className="pl-16">
        <StatusBar />
        <main className="px-4 py-4">{children}</main>
      </div>
    </div>
  );
}
