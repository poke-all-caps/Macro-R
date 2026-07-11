import { Link, useLocation } from "wouter";
import {
  Users, Settings, Search, Bell,
  LayoutGrid, List, FileText, Cog, Key, Plus,
} from "lucide-react";
import { useBotStatus, useAccounts } from "@/hooks/use-desk";
import { useLicense, TIER_META } from "@/hooks/use-license";
import { useState } from "react";

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
  const { licenseData } = useLicense();
  const [searchQuery, setSearchQuery] = useState("");

  const tier     = licenseData?.keyType ?? 'basic';
  const tierMeta = TIER_META[tier] ?? TIER_META.basic;
  const keyShort = licenseData ? `${licenseData.key.slice(0, 9)}…` : '—';
  const expiry   = licenseData
    ? new Date(licenseData.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const isRunning = status?.isRunning ?? false;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center h-14 px-4 border-b border-border shrink-0 bg-[hsl(220,38%,9%)] z-20 gap-4">

        {/* Logo — aligns with sidebar width */}
        <div className="flex items-center w-52 shrink-0">
          <img src="/rewards-desk-ui/macro-rewards-logo.png" alt="Macro Rewards" className="h-9 w-auto" />
        </div>

        {/* Search bar — centered */}
        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search accounts…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 rounded-full bg-[hsl(220,30%,16%)] border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-[hsl(220,30%,18%)] transition-colors"
            />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Add Account */}
          <Link href="/accounts">
            <button className="flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm transition-colors">
              <Plus className="w-4 h-4" />
              <span>Add Account</span>
            </button>
          </Link>

          {/* Bell */}
          <button className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <Bell className="w-4 h-4" />
          </button>

          {/* System status dot */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(220,35%,13%)] border border-border text-xs">
            <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-green-400'}`} />
            <span className="text-green-400 font-medium">{accounts.length} active</span>
          </div>

          {/* License badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(220,35%,13%)] border border-border min-w-0">
            <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
              style={{ background: tierMeta.bg }}>
              <Key className="w-3 h-3" style={{ color: tierMeta.color }} />
            </div>
            <span className="text-[11px] font-mono font-medium text-white leading-none">{keyShort}</span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
              style={{ color: tierMeta.color, background: tierMeta.bg }}
            >
              {tierMeta.label}
            </span>
            {licenseData && (
              <span className="text-[11px] text-muted-foreground font-mono">
                {accounts.length}<span className="opacity-50">/{licenseData.maxAccounts}</span>
              </span>
            )}
          </div>

        </div>
      </header>

      {/* ── Body (sidebar + main) ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-52 shrink-0 bg-[hsl(220,38%,9%)] border-r border-border flex flex-col z-10">
          <nav className="flex-1 px-2 pt-8 flex flex-col gap-2.5">
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
        <main className="flex-1 min-w-0 overflow-y-auto bg-[hsl(220,28%,12%)]">
          {children}
        </main>
      </div>
    </div>
  );
}
