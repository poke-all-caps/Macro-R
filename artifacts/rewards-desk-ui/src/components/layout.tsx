import { Link, useLocation } from "wouter";
import {
  Users, Settings, Terminal, Search, Bell,
  LayoutGrid, List, FileText, Cog,
  ChevronDown, Activity,
} from "lucide-react";
import { useBotStatus, useAccounts } from "@/hooks/use-desk";

const NAV_ITEMS = [
  { href: "/",         label: "Accounts",      icon: Users },
  { href: "/config",   label: "Global Config", icon: Cog },
  { href: "/instances",label: "Instances",     icon: LayoutGrid },
  { href: "/queries",  label: "Queries",       icon: List },
  { href: "/console",  label: "Logs",          icon: FileText },
  { href: "/settings", label: "Settings",      icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { status } = useBotStatus();
  const { accounts } = useAccounts();

  const isRunning = status?.isRunning ?? false;
  const activeCount = accounts.filter(a => a.status === "running").length;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center h-12 px-4 border-b border-border shrink-0 bg-[hsl(220,38%,9%)] z-20">
        {/* Logo */}
        <div className="flex items-center gap-2 w-40 shrink-0">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-sm">M</span>
          </div>
          <span className="font-semibold text-sm text-white">Macro Rewards</span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-sm mx-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search instances..."
              className="w-full h-8 pl-8 pr-3 rounded-md bg-[hsl(220,35%,13%)] border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-0 transition-colors"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          {/* Bell */}
          <button className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors relative">
            <Bell className="w-4 h-4" />
          </button>

          {/* System status */}
          <div className="flex flex-col items-start px-3 py-1 rounded-md bg-[hsl(220,35%,13%)] border border-border text-xs">
            <span className="text-muted-foreground leading-none mb-0.5">System Status</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-green-400'}`} />
              <span className="text-green-400 font-medium">
                Active ({accounts.length} {accounts.length === 1 ? 'Instance' : 'Instances'})
              </span>
            </div>
          </div>

          {/* User */}
          <button className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[hsl(220,35%,13%)] border border-border hover:bg-white/5 transition-colors">
            <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">U</div>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-medium text-white leading-none">User</span>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">user@outlook.com</span>
            </div>
            <ChevronDown className="w-3 h-3 text-muted-foreground ml-1" />
          </button>

          {/* Settings gear */}
          <button className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Body (sidebar + main) ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-40 shrink-0 bg-[hsl(220,38%,9%)] border-r border-border flex flex-col z-10">
          <nav className="flex-1 px-2 pt-2 flex flex-col gap-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/" ? location === "/" : location.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${
                    isActive
                      ? "bg-[hsl(217,70%,30%)] text-white"
                      : "text-[hsl(215,20%,55%)] hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-[15px] h-[15px] shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
