import { Link, useLocation } from "wouter";
import {
  Users, Settings, Search, Bell,
  LayoutGrid, List, FileText, Cog, Key,
} from "lucide-react";
import { useBotStatus, useAccounts } from "@/hooks/use-desk";
import { useLicense, TIER_META } from "@/hooks/use-license";

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

  const tier     = licenseData?.keyType ?? 'basic';
  const tierMeta = TIER_META[tier] ?? TIER_META.basic;
  const keyShort = licenseData ? `${licenseData.key.slice(0, 9)}…` : '—';
  const expiry   = licenseData
    ? new Date(licenseData.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const isRunning = status?.isRunning ?? false;
  const activeCount = accounts.filter(a => a.status === "running").length;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center h-14 px-4 border-b border-border shrink-0 bg-[hsl(220,38%,9%)] z-20">
        {/* Logo */}
        <div className="flex items-center gap-3 w-52 shrink-0">
          <img src="/rewards-desk-ui/macro-rewards-logo.png" alt="Macro Rewards" className="h-9 w-auto" />
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

          {/* License card */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-[hsl(220,35%,13%)] border border-border min-w-0">
            {/* Icon */}
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ background: tierMeta.bg }}>
              <Key className="w-3.5 h-3.5" style={{ color: tierMeta.color }} />
            </div>

            {/* Key + expiry */}
            <div className="flex flex-col items-start min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-medium text-white leading-none tracking-wide">
                  {keyShort}
                </span>
                {/* Tier badge */}
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
                  style={{ color: tierMeta.color, background: tierMeta.bg }}
                >
                  {tierMeta.label}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
                {expiry ? `Exp ${expiry}` : 'Not activated'}
              </span>
            </div>

            {/* Slots */}
            {licenseData && (
              <div className="flex flex-col items-end ml-1 shrink-0">
                <span className="text-[11px] font-semibold text-white leading-none">
                  {accounts.length}
                  <span className="text-muted-foreground font-normal">/{licenseData.maxAccounts}</span>
                </span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5">slots</span>
              </div>
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
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
