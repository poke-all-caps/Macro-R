import { Link, useLocation } from "wouter";
import { Activity, Terminal, Users } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Home", icon: Activity },
    { href: "/accounts", label: "Accounts", icon: Users },
    { href: "/console", label: "Console", icon: Terminal },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/50 glass-panel flex flex-col z-10 relative">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary/10 border border-primary/30 flex items-center justify-center glow-cyan">
              <Terminal className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-mono font-bold text-sm tracking-widest text-primary text-shadow-cyan">REWARDS_DESK</h1>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">v2.4.1 // ONLINE</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 font-mono text-sm uppercase tracking-wider group relative overflow-hidden ${isActive ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent"}`}>
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary glow-cyan" />
                )}
                <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "group-hover:text-foreground"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            SYSTEM SECURE
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* Subtle grid background effect */}
        <div className="absolute inset-0 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDQwIEwgNDAgNDAgTCA0MCAwIiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-50 z-0" />
        
        <div className="relative z-10 flex-1 flex flex-col w-full h-full overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
