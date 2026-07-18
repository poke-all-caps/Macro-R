import { useAccounts, useCookieCapture } from '@/hooks/use-desk';
import type { AccountInput, AccountPatch, AccountProxy } from '@/hooks/use-desk';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { StatusChip } from '@/components/status-chip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, Plus, Trash2, Database, AlertCircle, Pencil,
  RefreshCw, Eye, EyeOff, ShieldAlert, Network, Settings2,
  Globe, CheckCircle2, Loader2, MonitorSmartphone,
} from 'lucide-react';
import { useState } from 'react';
import type { DeskAccount } from '@workspace/api-client-react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function PasswordInput({ id, value, onChange, placeholder, className }: {
  id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className={`pr-10 bg-black/50 border-border/50 font-mono focus-visible:ring-primary ${className ?? ''}`}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground font-mono">{hint}</p>}
    </div>
  );
}

// ─── Default form state ────────────────────────────────────────────────────────

function emptyForm(): AccountInput {
  return {
    email: '',
    name: '',
    password: '',
    totpSecret: '',
    recoveryEmail: '',
    geoLocale: 'auto',
    langCode: 'en',
    proxy: { url: '', port: '', username: '', password: '' } as unknown as AccountProxy,
    saveFingerprint: { mobile: false, desktop: false },
  };
}

// ─── Proxy tab ────────────────────────────────────────────────────────────────

function ProxyTab({ proxy, setProxy }: {
  proxy: AccountProxy;
  setProxy: (p: Partial<AccountProxy>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-mono text-muted-foreground">All proxy fields are optional. Leave URL blank to run without a proxy.</p>
      <FieldRow label="Proxy URL">
        <Input value={proxy.url ?? ''} onChange={e => setProxy({ url: e.target.value })}
          placeholder="socks5://host or http://host"
          className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
      </FieldRow>
      <FieldRow label="Port">
        <Input type="number" value={proxy.port ?? ''} onChange={e => setProxy({ port: e.target.value })}
          placeholder="1080"
          className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" />
      </FieldRow>
      <FieldRow label="Username">
        <Input value={proxy.username ?? ''} onChange={e => setProxy({ username: e.target.value })}
          placeholder="proxy username (optional)"
          className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
      </FieldRow>
      <FieldRow label="Password">
        <PasswordInput id="proxy-password" value={(proxy.password as string) ?? ''}
          onChange={v => setProxy({ password: v })} placeholder="proxy password (optional)" />
      </FieldRow>
    </div>
  );
}

// ─── Options tab ──────────────────────────────────────────────────────────────

const GEO_LOCALES = ['auto','en-US','en-GB','en-AU','en-CA','de-DE','fr-FR','es-ES','pt-BR','it-IT','nl-NL','pl-PL','sv-SE','ja-JP','ko-KR','zh-CN','zh-TW'];
const LANG_CODES  = ['en','de','fr','es','pt','it','nl','pl','sv','ja','ko','zh'];

function OptionsTab({ form, set }: { form: AccountInput; set: (p: Partial<AccountInput>) => void }) {
  const fp = form.saveFingerprint ?? {};
  return (
    <div className="space-y-5">
      <FieldRow label="Geo Locale">
        <select value={form.geoLocale ?? 'auto'} onChange={e => set({ geoLocale: e.target.value })}
          className="w-full bg-black/50 border border-border/50 rounded-md px-3 py-2 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-primary">
          {GEO_LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Language Code">
        <select value={form.langCode ?? 'en'} onChange={e => set({ langCode: e.target.value })}
          className="w-full bg-black/50 border border-border/50 rounded-md px-3 py-2 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-primary">
          {LANG_CODES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </FieldRow>
      <div className="space-y-3 pt-1 border-t border-border/40">
        <p className="font-mono text-xs uppercase text-muted-foreground tracking-wider pt-1">Save Fingerprint</p>
        <p className="text-xs text-muted-foreground font-mono">Reuse the same browser fingerprint across runs for this account.</p>
        <div className="flex items-center justify-between">
          <Label className="font-mono text-sm text-white">Desktop</Label>
          <Switch checked={Boolean(fp.desktop)} onCheckedChange={v => set({ saveFingerprint: { ...fp, desktop: v } })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-mono text-sm text-white">Mobile</Label>
          <Switch checked={Boolean(fp.mobile)} onCheckedChange={v => set({ saveFingerprint: { ...fp, mobile: v } })} />
        </div>
      </div>
    </div>
  );
}

// ─── Cookie capture panel (shown inside the Credentials tab) ──────────────────

function CookieCapturePanel({
  form,
  set,
  onCaptured,
}: {
  form: AccountInput;
  set: (p: Partial<AccountInput>) => void;
  onCaptured: (cookieCount: number) => void;
}) {
  const capture = useCookieCapture();
  const status  = capture.captureStatus;

  const isDone    = status?.status === 'done';
  const isFailed  = status?.status === 'failed';
  const isActive  = !!capture.sessionId && !isDone && !isFailed;

  // Notify parent when capture finishes successfully
  if (isDone && status.cookieCount !== undefined) {
    onCaptured(status.cookieCount);
  }

  const handleLaunch = () => {
    if (!form.email) return;
    capture.reset();
    capture.start.mutate(form.email);
  };

  const handleAbort = () => {
    capture.abort.mutate(undefined as unknown as void);
    capture.reset();
  };

  const statusLabel: Record<string, string> = {
    opening:   'Opening browser window…',
    waiting:   'Waiting for you to sign in to Microsoft Rewards…',
    capturing: 'Capturing cookies…',
    done:      `Cookies captured successfully`,
    failed:    'Capture failed',
  };

  return (
    <div className="space-y-4">
      <FieldRow label="Alias *">
        <Input value={form.name} onChange={e => set({ name: e.target.value })}
          placeholder="e.g. Primary Account"
          className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
      </FieldRow>

      <FieldRow label="Microsoft Email *"
        hint="Must match the account you'll sign into in the browser.">
        <Input type="email" value={form.email} onChange={e => set({ email: e.target.value })}
          placeholder="user@outlook.com"
          className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off"
          disabled={isActive || isDone} />
      </FieldRow>

      {/* Launch / status area */}
      {!capture.sessionId && (
        <Button type="button"
          disabled={!form.email || !form.name || capture.start.isPending}
          onClick={handleLaunch}
          className="w-full font-mono text-xs uppercase bg-primary/90 hover:bg-primary text-primary-foreground">
          <Globe className="w-4 h-4 mr-2" />
          Launch Login Browser
        </Button>
      )}

      {capture.sessionId && (
        <div className={`rounded border px-4 py-3 space-y-2 font-mono text-xs
          ${isDone   ? 'border-green-500/30 bg-green-500/10'  :
            isFailed ? 'border-destructive/30 bg-destructive/10' :
                       'border-primary/30 bg-primary/5'}`}>

          <div className="flex items-center gap-2">
            {isDone
              ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              : isFailed
              ? <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              : <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />}
            <span className={isDone ? 'text-green-300' : isFailed ? 'text-destructive' : 'text-primary'}>
              {statusLabel[status?.status ?? 'opening']}
            </span>
          </div>

          {isDone && (
            <p className="text-green-400/80">
              {status!.cookieCount} cookie{status!.cookieCount !== 1 ? 's' : ''} saved to{' '}
              <span className="text-green-300">sessions/{form.email}/session_desktop.json</span>
            </p>
          )}

          {isFailed && status?.error && (
            <p className="text-destructive/80">{status.error}</p>
          )}

          {!isDone && !isFailed && (
            <p className="text-muted-foreground">
              A Chromium window has opened. Sign in, then wait — this dialog will update automatically.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {isFailed && (
              <Button type="button" size="sm" variant="outline"
                onClick={handleLaunch}
                className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10">
                Retry
              </Button>
            )}
            {isActive && (
              <Button type="button" size="sm" variant="outline"
                onClick={handleAbort}
                className="font-mono text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                Abort
              </Button>
            )}
            {(isDone || isFailed) && (
              <Button type="button" size="sm" variant="ghost"
                onClick={() => { capture.reset(); }}
                className="font-mono text-xs text-muted-foreground hover:text-white">
                Reset
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add dialog ───────────────────────────────────────────────────────────────

type AuthMethod = 'credentials' | 'cookies';

function AddDialog({ addAccount }: { addAccount: ReturnType<typeof useAccounts>['addAccount'] }) {
  const [open, setOpen]         = useState(false);
  const [form, setForm]         = useState<AccountInput>(emptyForm);
  const [authMethod, setMethod] = useState<AuthMethod>('credentials');
  const [cookiesDone, setCookiesDone] = useState(false);
  const [error, setError]       = useState('');

  const set = (patch: Partial<AccountInput>) => setForm(f => ({ ...f, ...patch }));
  const setProxy = (patch: Partial<AccountProxy>) =>
    setForm(f => ({ ...f, proxy: { ...f.proxy, ...patch } as AccountProxy }));

  const canSubmitCredentials = !!form.email && !!form.name && !!form.password;
  const canSubmitCookies     = !!form.email && !!form.name && cookiesDone;
  const canSubmit = authMethod === 'credentials' ? canSubmitCredentials : canSubmitCookies;

  const handleClose = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setForm(emptyForm());
      setMethod('credentials');
      setCookiesDone(false);
      setError('');
    }
  };

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: AccountInput = {
      ...form,
      ...(authMethod === 'cookies' ? { method: 'cookies' } as never : {}),
    };
    addAccount.mutate(payload, {
      onSuccess: () => handleClose(false),
      onError: (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button className="font-mono tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />
          Register Target
        </Button>
      </DialogTrigger>

      <DialogContent className="glass-panel border-primary/30 sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-primary flex items-center gap-2">
            <Database className="w-4 h-4" />
            New Target Registration
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Credentials are written to the desk display store and the bot engine's account file.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handle} className="space-y-4 pt-2">
          <Tabs defaultValue="credentials">
            <TabsList className="w-full bg-black/40 border border-border/40">
              <TabsTrigger value="credentials" className="flex-1 font-mono text-xs uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />Credentials
              </TabsTrigger>
              <TabsTrigger value="proxy" className="flex-1 font-mono text-xs uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Network className="w-3.5 h-3.5 mr-1.5" />Proxy
              </TabsTrigger>
              <TabsTrigger value="options" className="flex-1 font-mono text-xs uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Settings2 className="w-3.5 h-3.5 mr-1.5" />Options
              </TabsTrigger>
            </TabsList>

            {/* ── Credentials tab ── */}
            <TabsContent value="credentials" className="pt-4 space-y-4">

              {/* Auth method toggle */}
              <div className="flex rounded border border-border/40 overflow-hidden bg-black/30 p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setMethod('credentials')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-mono uppercase rounded transition-colors
                    ${authMethod === 'credentials'
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-white'}`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> Enter Password
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('cookies')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-mono uppercase rounded transition-colors
                    ${authMethod === 'cookies'
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-white'}`}
                >
                  <MonitorSmartphone className="w-3.5 h-3.5" /> Capture Cookies
                </button>
              </div>

              {/* Credential fields */}
              {authMethod === 'credentials' && (
                <div className="space-y-4">
                  <FieldRow label="Alias *">
                    <Input value={form.name} onChange={e => set({ name: e.target.value })}
                      placeholder="e.g. Primary Account"
                      className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
                  </FieldRow>
                  <FieldRow label="Microsoft Email *">
                    <Input type="email" value={form.email} onChange={e => set({ email: e.target.value })}
                      placeholder="user@outlook.com"
                      className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
                  </FieldRow>
                  <FieldRow label="Password *">
                    <PasswordInput id="add-password" value={form.password} onChange={v => set({ password: v })}
                      placeholder="Account password" />
                  </FieldRow>
                  <FieldRow label="TOTP / 2FA Secret"
                    hint="Leave blank if the account doesn't use an authenticator app.">
                    <Input value={form.totpSecret ?? ''} onChange={e => set({ totpSecret: e.target.value })}
                      placeholder="Base32 TOTP secret (optional)"
                      className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
                  </FieldRow>
                  <FieldRow label="Recovery Email">
                    <Input type="email" value={form.recoveryEmail ?? ''} onChange={e => set({ recoveryEmail: e.target.value })}
                      placeholder="recovery@example.com (optional)"
                      className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
                  </FieldRow>
                </div>
              )}

              {/* Cookie capture panel */}
              {authMethod === 'cookies' && (
                <CookieCapturePanel
                  form={form}
                  set={set}
                  onCaptured={(count) => setCookiesDone(count > 0)}
                />
              )}
            </TabsContent>

            <TabsContent value="proxy" className="pt-4">
              <ProxyTab proxy={(form.proxy ?? {}) as AccountProxy} setProxy={setProxy} />
            </TabsContent>
            <TabsContent value="options" className="pt-4">
              <OptionsTab form={form} set={set} />
            </TabsContent>
          </Tabs>

          {error && (
            <p className="text-xs font-mono text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} className="font-mono text-xs uppercase">Cancel</Button>
            <Button type="submit" disabled={addAccount.isPending || !canSubmit}
              className="font-mono text-xs uppercase bg-primary hover:bg-primary/90 text-primary-foreground">
              {addAccount.isPending ? 'Registering…' : 'Register'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────

function EditDialog({
  account,
  updateAccount,
}: {
  account: DeskAccount;
  updateAccount: ReturnType<typeof useAccounts>['updateAccount'];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const blankPatch = (): AccountPatch => ({
    name: account.name,
    email: account.email,
    password: '',
    totpSecret: '',
    recoveryEmail: '',
    geoLocale: 'auto',
    langCode: 'en',
    proxy: { url: '', port: '', username: '', password: '' } as unknown as AccountProxy,
    saveFingerprint: { mobile: false, desktop: false },
  });

  const [form, setForm] = useState<AccountPatch>(blankPatch);
  const set = (patch: Partial<AccountPatch>) => setForm(f => ({ ...f, ...patch }));
  const setProxy = (patch: Partial<AccountProxy>) =>
    setForm(f => ({ ...f, proxy: { ...((f.proxy ?? {}) as AccountProxy), ...patch } as AccountProxy }));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: AccountPatch = {
      name: form.name || undefined,
      email: form.email || undefined,
    };
    if (form.password)      payload.password      = form.password;
    if (form.totpSecret)    payload.totpSecret    = form.totpSecret;
    if (form.recoveryEmail) payload.recoveryEmail = form.recoveryEmail;
    if (form.geoLocale)     payload.geoLocale     = form.geoLocale;
    if (form.langCode)      payload.langCode      = form.langCode;
    const p = form.proxy as AccountProxy | undefined;
    if (p?.url) payload.proxy = p;
    if (form.saveFingerprint) payload.saveFingerprint = form.saveFingerprint;

    updateAccount.mutate({ id: account.id, data: payload }, {
      onSuccess: () => setOpen(false),
      onError: (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    });
  };

  const handleResync = () => {
    updateAccount.mutate(
      { id: account.id, data: { resync: true } },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => {
      setOpen(o);
      if (o) { setForm(blankPatch()); setError(''); }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-white h-8 w-8" title="Edit account">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="glass-panel border-border/50 sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase tracking-wider text-white flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Edit Account
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Only filled fields are saved. Leave a field blank to keep its current value.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          <Tabs defaultValue="credentials">
            <TabsList className="w-full bg-black/40 border border-border/40">
              <TabsTrigger value="credentials" className="flex-1 font-mono text-xs uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />Credentials
              </TabsTrigger>
              <TabsTrigger value="proxy" className="flex-1 font-mono text-xs uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Network className="w-3.5 h-3.5 mr-1.5" />Proxy
              </TabsTrigger>
              <TabsTrigger value="options" className="flex-1 font-mono text-xs uppercase data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                <Settings2 className="w-3.5 h-3.5 mr-1.5" />Options
              </TabsTrigger>
            </TabsList>

            <TabsContent value="credentials" className="pt-4 space-y-4">
              <FieldRow label="Alias">
                <Input value={form.name ?? ''} onChange={e => set({ name: e.target.value })}
                  className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
              </FieldRow>
              <FieldRow label="Microsoft Email">
                <Input type="email" value={form.email ?? ''} onChange={e => set({ email: e.target.value })}
                  className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
              </FieldRow>
              <FieldRow label="New Password" hint="Leave blank to keep the current password.">
                <PasswordInput id="edit-password" value={(form.password as string) ?? ''} onChange={v => set({ password: v })}
                  placeholder="Leave blank to keep current" />
              </FieldRow>
              <FieldRow label="TOTP / 2FA Secret">
                <Input value={form.totpSecret ?? ''} onChange={e => set({ totpSecret: e.target.value })}
                  placeholder="Leave blank to keep current"
                  className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
              </FieldRow>
              <FieldRow label="Recovery Email">
                <Input type="email" value={form.recoveryEmail ?? ''} onChange={e => set({ recoveryEmail: e.target.value })}
                  placeholder="Leave blank to keep current"
                  className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
              </FieldRow>
            </TabsContent>

            <TabsContent value="proxy" className="pt-4">
              <ProxyTab proxy={(form.proxy ?? {}) as AccountProxy} setProxy={setProxy} />
            </TabsContent>
            <TabsContent value="options" className="pt-4">
              <OptionsTab form={form as AccountInput} set={patch => set(patch)} />
            </TabsContent>
          </Tabs>

          <div className="pt-2 border-t border-border/40">
            <p className="font-mono text-xs uppercase text-muted-foreground mb-2 tracking-wider">Session Reset</p>
            <Button type="button" variant="outline" onClick={handleResync} disabled={updateAccount.isPending}
              className="w-full font-mono text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Re-Sync (Reset Points & Status)
            </Button>
          </div>

          {error && (
            <p className="text-xs font-mono text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="font-mono text-xs uppercase">Cancel</Button>
            <Button type="submit" disabled={updateAccount.isPending || !form.name || !form.email}
              className="font-mono text-xs uppercase bg-primary hover:bg-primary/90 text-primary-foreground">
              {updateAccount.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Accounts() {
  const { accounts, isLoading, addAccount, deleteAccount, updateAccount } = useAccounts();

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-mono font-bold tracking-tight text-white mb-2 uppercase flex items-center gap-3">
            <Users className="w-6 h-6 text-primary" />
            Target Directory
          </h2>
          <p className="text-muted-foreground font-mono text-sm">Manage automation targets and credentials.</p>
        </div>
        <AddDialog addAccount={addAccount} />
      </div>

      <div className="flex-1 min-h-0 relative">
        <Card className="glass-panel border-border/50 absolute inset-0 overflow-hidden flex flex-col">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-border/50 bg-black/20 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <div className="col-span-3">Alias / Identity</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Points Yield</div>
            <div className="col-span-2 text-right">Searches</div>
            <div className="col-span-2">Last Sync</div>
            <div className="col-span-1 text-center">Actions</div>
          </div>

          <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground font-mono">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                Fetching directory...
              </div>
            ) : accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 p-8">
                <AlertCircle className="w-12 h-12 opacity-20" />
                <p className="font-mono text-sm uppercase tracking-widest opacity-50">Directory Empty</p>
              </div>
            ) : (
              accounts.map(account => (
                <div key={account.id}
                  className="grid grid-cols-12 gap-4 p-4 items-center rounded bg-white/5 border border-transparent hover:border-border transition-colors group">
                  <div className="col-span-3 min-w-0">
                    <p className="font-bold text-sm text-white truncate">{account.name}</p>
                    <p className="font-mono text-xs text-muted-foreground truncate">{account.email}</p>
                  </div>
                  <div className="col-span-2">
                    <StatusChip status={account.status} />
                  </div>
                  <div className="col-span-2 text-right font-mono text-sm">
                    <div className="text-yellow-500">+{account.todayPoints}</div>
                    <div className="text-xs text-muted-foreground opacity-50">{account.totalPoints} total</div>
                  </div>
                  <div className="col-span-2 text-right font-mono text-sm">
                    {account.searchesCompleted || 0} / 50
                  </div>
                  <div className="col-span-2 font-mono text-xs text-muted-foreground">
                    {account.lastRun ? new Date(account.lastRun).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : 'Never'}
                  </div>
                  <div className="col-span-1 flex justify-center items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <EditDialog account={account} updateAccount={updateAccount} />
                    <Button variant="ghost" size="icon"
                      onClick={() => deleteAccount.mutate({ id: account.id })}
                      disabled={deleteAccount.isPending}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                      title="Remove Target">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
