import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Trash2, CheckCircle2, Loader2 } from 'lucide-react';

export default function Settings() {
  const qc = useQueryClient();
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  const seed = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/desk/seed-demo', { method: 'POST' });
      return r.json() as Promise<{ added: number; total: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setSeedMsg(
        data.added > 0
          ? `✓ Added ${data.added} demo account${data.added > 1 ? 's' : ''} (${data.total} total)`
          : 'Demo accounts already present — nothing added.'
      );
      setTimeout(() => setSeedMsg(null), 4000);
    },
  });

  const clear = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/desk/seed-demo', { method: 'DELETE' });
      return r.json() as Promise<{ removed: number; total: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setClearMsg(`✓ Removed ${data.removed} demo account${data.removed !== 1 ? 's' : ''}`);
      setTimeout(() => setClearMsg(null), 4000);
    },
  });

  return (
    <div className="px-6 py-6 max-w-2xl space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">App configuration and developer tools</p>
      </div>

      {/* ── Developer Tools ── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">Developer Tools</h2>

        <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4 h-4 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Seed Demo Accounts</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adds 4 pre-configured demo accounts so you can preview the UI with realistic data. Safe to run multiple times — duplicates are skipped.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {seed.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <FlaskConical className="w-4 h-4" />}
              Add Demo Accounts
            </button>

            <button
              onClick={() => clear.mutate()}
              disabled={clear.isPending}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-600"
            >
              {clear.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Trash2 className="w-4 h-4" />}
              Clear Demo Accounts
            </button>

            {(seedMsg || clearMsg) && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {seedMsg ?? clearMsg}
              </span>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
