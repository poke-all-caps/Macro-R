import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Database, Eye, EyeOff, ShieldAlert, Network, Settings2,
  Globe, CheckCircle2, Loader2, MonitorSmartphone, AlertCircle, ClipboardPaste,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { useCookieCapture, useImportCookies, useAccounts } from '@/hooks/use-desk';
import type { AccountInput, AccountProxy } from '@/hooks/use-desk';

// ─── PasswordInput ────────────────────────────────────────────────────────────

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

// ─── FieldRow ─────────────────────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground font-mono">{hint}</p>}
    </div>
  );
}

// ─── ProxyTab ─────────────────────────────────────────────────────────────────

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
        <PasswordInput id="proxy-password-shared" value={(proxy.password as string) ?? ''}
          onChange={v => setProxy({ password: v })} placeholder="proxy password (optional)" />
      </FieldRow>
    </div>
  );
}

// ─── OptionsTab ───────────────────────────────────────────────────────────────

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

// ─── CookieCapturePanel ───────────────────────────────────────────────────────

function CookieCapturePanel({
  form, set, onCaptured,
}: {
  form: AccountInput;
  set: (p: Partial<AccountInput>) => void;
  onCaptured: (cookieCount: number) => void;
}) {
  const capture     = useCookieCapture();
  const importCookies = useImportCookies();
  const status      = capture.captureStatus;

  const [captureMode, setCaptureMode] = useState<'browser' | 'paste'>('paste');
  const [pasteValue, setPasteValue]   = useState('');

  const isDone   = status?.status === 'done';
  const isFailed = status?.status === 'failed';
  const isActive = !!capture.sessionId && !isDone && !isFailed;

  if (isDone && status.cookieCount !== undefined) {
    onCaptured(status.cookieCount);
  }
  if (importCookies.isSuccess && importCookies.data?.count) {
    onCaptured(importCookies.data.count);
  }

  const handleLaunch = () => {
    if (!form.email || !form.name) return;
    capture.reset();
    capture.start.mutate(form.email);
  };

  const handleAbort = () => {
    capture.abort.mutate(undefined as unknown as void);
    capture.reset();
  };

  const handlePasteImport = () => {
    if (!form.email || !form.name || !pasteValue.trim()) return;
    importCookies.mutate({ email: form.email, cookies: pasteValue.trim() });
  };

  const statusLabel: Record<string, string> = {
    opening:   'Opening browser window…',
    waiting:   'Waiting for you to sign in to Microsoft Rewards…',
    capturing: 'Capturing cookies…',
    done:      'Cookies captured successfully',
    failed:    'Capture failed',
  };

  const startError = !capture.sessionId && capture.start.isError
    ? (capture.start.error instanceof Error ? capture.start.error.message : String(capture.start.error))
    : null;

  const pasteError = importCookies.isError
    ? (importCookies.error instanceof Error ? importCookies.error.message : String(importCookies.error))
    : null;

  return (
    <div className="space-y-4">
      <FieldRow label="Alias *">
        <Input value={form.name} onChange={e => set({ name: e.target.value })}
          placeholder="e.g. Primary Account"
          className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off" />
      </FieldRow>
      <FieldRow label="Microsoft Email *" hint="Must match the account you'll sign into in the browser.">
        <Input type="email" value={form.email} onChange={e => set({ email: e.target.value })}
          placeholder="user@outlook.com"
          className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off"
          disabled={isActive || isDone || importCookies.isSuccess} />
      </FieldRow>

      {/* Mode toggle */}
      {!importCookies.isSuccess && (
        <div className="flex rounded border border-border/40 overflow-hidden bg-black/20 p-0.5 gap-0.5">
          <button type="button" onClick={() => setCaptureMode('paste')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono uppercase rounded transition-colors
              ${captureMode === 'paste' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}>
            <ClipboardPaste className="w-3.5 h-3.5" /> Paste Cookies
          </button>
          <button type="button" onClick={() => { setCaptureMode('browser'); capture.reset(); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono uppercase rounded transition-colors
              ${captureMode === 'browser' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}>
            <Globe className="w-3.5 h-3.5" /> Launch Browser
          </button>
        </div>
      )}

      {/* ── Paste mode ── */}
      {captureMode === 'paste' && !importCookies.isSuccess && (
        <div className="space-y-3">
          <div className="rounded border border-border/30 bg-black/30 px-3 py-2.5 text-xs font-mono text-muted-foreground space-y-1.5 leading-relaxed">
            <p className="text-white/70 font-semibold">How to export cookies:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open <span className="text-primary">rewards.microsoft.com</span> in your browser and sign in.</li>
              <li>Install the <span className="text-primary">Cookie-Editor</span> extension (Chrome / Firefox).</li>
              <li>Click the extension → <span className="text-primary">Export → Export as JSON</span>.</li>
              <li>Paste the copied JSON below.</li>
            </ol>
          </div>
          <Textarea
            value={pasteValue}
            onChange={e => setPasteValue(e.target.value)}
            placeholder='[{"name":"MUID","value":"...","domain":".bing.com",...}, ...]'
            className="bg-black/50 border-border/50 font-mono text-xs min-h-[90px] focus-visible:ring-primary resize-none"
            disabled={importCookies.isPending}
          />
          {pasteError && (
            <p className="text-xs font-mono text-destructive">{pasteError}</p>
          )}
          <Button type="button"
            disabled={!form.email || !form.name || !pasteValue.trim() || importCookies.isPending}
            onClick={handlePasteImport}
            className="w-full font-mono text-xs uppercase bg-primary/90 hover:bg-primary text-primary-foreground">
            {importCookies.isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
              : <><ClipboardPaste className="w-4 h-4 mr-2" /> Save Cookies</>}
          </Button>
        </div>
      )}

      {/* Paste success */}
      {importCookies.isSuccess && (
        <div className="rounded border border-green-500/30 bg-green-500/10 px-4 py-3 space-y-1 font-mono text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-green-300">Cookies imported successfully</span>
          </div>
          <p className="text-green-400/80">
            {importCookies.data.count} cookie{importCookies.data.count !== 1 ? 's' : ''} saved to{' '}
            <span className="text-green-300">sessions/{form.email}/session_desktop.json</span>
          </p>
        </div>
      )}

      {/* ── Browser-launch mode ── */}
      {captureMode === 'browser' && !importCookies.isSuccess && (
        <>
          {!capture.sessionId && (
            <Button type="button"
              disabled={!form.email || !form.name || capture.start.isPending}
              onClick={handleLaunch}
              className="w-full font-mono text-xs uppercase bg-primary/90 hover:bg-primary text-primary-foreground">
              {capture.start.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Launching…</>
                : <><Globe className="w-4 h-4 mr-2" /> Launch Login Browser</>}
            </Button>
          )}

          {startError && (
            <div className="rounded border border-destructive/30 bg-destructive/10 px-4 py-3 space-y-2 font-mono text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                <span className="text-destructive">Failed to start capture session</span>
              </div>
              <p className="text-destructive/80">{startError}</p>
              <Button type="button" size="sm" variant="outline" onClick={handleLaunch}
                className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10">
                Retry
              </Button>
            </div>
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
                  A Chromium window has opened on the server. Sign in there, then wait — this dialog will update automatically.
                </p>
              )}
              <div className="flex gap-2 pt-1">
                {isFailed && (
                  <Button type="button" size="sm" variant="outline" onClick={handleLaunch}
                    className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10">
                    Retry
                  </Button>
                )}
                {isActive && (
                  <Button type="button" size="sm" variant="outline" onClick={handleAbort}
                    className="font-mono text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                    Abort
                  </Button>
                )}
                {(isDone || isFailed) && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => capture.reset()}
                    className="font-mono text-xs text-muted-foreground hover:text-white">
                    Reset
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

type AuthMethod = 'credentials' | 'cookies';

// ─── AddAccountDialog ─────────────────────────────────────────────────────────

export function AddAccountDialog({
  addAccount,
  trigger,
}: {
  addAccount: ReturnType<typeof useAccounts>['addAccount'];
  /** Optional custom trigger element; defaults to a "+ Add Account" button */
  trigger?: React.ReactNode;
}) {
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

  const defaultTrigger = (
    <Button className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all">
      <Plus className="w-4 h-4" />
      Add Account
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        {trigger ?? defaultTrigger}
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
                    <PasswordInput id="add-password-shared" value={form.password} onChange={v => set({ password: v })}
                      placeholder="Account password" />
                  </FieldRow>
                  <FieldRow label="TOTP / 2FA Secret" hint="Leave blank if the account doesn't use an authenticator app.">
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
