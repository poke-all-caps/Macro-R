import { Link, useLocation } from "wouter";
import {
  Users, Settings,
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

  const isRunning = status?.isRunning ?? false;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center h-14 px-4 border-b border-border shrink-0 bg-[hsl(220,38%,9%)] z-20 gap-4">

        <div className="flex items-center w-52 shrink-0">
          <img src="/rewards-desk-ui/macro-rewards-logo.png" alt="Macro Rewards" className="h-9 w-auto" />
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 shrink-0">

          {/* System status */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(220,35%,13%)] border border-border text-xs">
            <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-green-400'}`} />
            <span className="text-green-400 font-medium">{accounts.length} active</span>
          </div>

          {/* License badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(220,35%,13%)] border border-border min-w-0">
            <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: tierMeta.bg }}>
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

          {/* Profile avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all select-none">
            M
          </div>

        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        <aside className="w-52 shrink-0 bg-[hsl(220,38%,9%)] border-r border-border flex flex-col z-10">
          <nav className="flex-1 px-2 pt-3 flex flex-col gap-0.5">
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

        <main className="flex-1 min-w-0 overflow-y-auto bg-[hsl(220,28%,12%)]">
          {children}
        </main>
      </div>
    </div>
  );
}
