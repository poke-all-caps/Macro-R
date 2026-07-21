import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Database, Eye, EyeOff, ShieldAlert, Network, Settings2,
  Globe, CheckCircle2, Loader2, ClipboardPaste,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { useImportCookies, useAccounts } from '@/hooks/use-desk';
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

const MS_LOGIN_URL =
  'https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=11&wp=MBI_SSL' +
  '&wreply=https%3A%2F%2Frewards.microsoft.com%2F&id=264080';

function CookieCapturePanel({
  form, set, onCaptured,
}: {
  form: AccountInput;
  set: (p: Partial<AccountInput>) => void;
  onCaptured: (cookieCount: number) => void;
}) {
  const importCookies = useImportCookies();

  const [captureMode, setCaptureMode] = useState<'guide' | 'paste'>('guide');
  const [pasteValue, setPasteValue]   = useState('');
  const [tabOpened, setTabOpened]     = useState(false);

  if (importCookies.isSuccess && importCookies.data?.count) {
    onCaptured(importCookies.data.count);
  }

  const handleOpenTab = () => {
    window.open(MS_LOGIN_URL, '_blank', 'noopener,noreferrer');
    setTabOpened(true);
  };

  const handlePasteImport = () => {
    if (!form.email || !form.name || !pasteValue.trim()) return;
    importCookies.mutate({ email: form.email, cookies: pasteValue.trim() });
  };

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
      <FieldRow label="Microsoft Email *" hint="Must match the account you sign into.">
        <Input type="email" value={form.email} onChange={e => set({ email: e.target.value })}
          placeholder="user@outlook.com"
          className="bg-black/50 border-border/50 font-mono focus-visible:ring-primary" autoComplete="off"
          disabled={importCookies.isSuccess} />
      </FieldRow>

      {/* Mode toggle */}
      {!importCookies.isSuccess && (
        <div className="flex rounded border border-border/40 overflow-hidden bg-black/20 p-0.5 gap-0.5">
          <button type="button" onClick={() => setCaptureMode('guide')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono uppercase rounded transition-colors
              ${captureMode === 'guide' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}>
            <Globe className="w-3.5 h-3.5" /> Sign In &amp; Export
          </button>
          <button type="button" onClick={() => setCaptureMode('paste')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-mono uppercase rounded transition-colors
              ${captureMode === 'paste' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-white'}`}>
            <ClipboardPaste className="w-3.5 h-3.5" /> Paste Cookies
          </button>
        </div>
      )}

      {/* ── Guide mode (opens real browser tab) ── */}
      {captureMode === 'guide' && !importCookies.isSuccess && (
        <div className="space-y-3">
          {/* Step list */}
          <div className="rounded border border-border/30 bg-black/30 px-3 py-3 text-xs font-mono text-muted-foreground space-y-2 leading-relaxed">
            <p className="text-white/80 font-semibold text-[11px] uppercase tracking-wider">Step-by-step</p>
            <ol className="space-y-2">
              <li className="flex gap-2">
                <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${tabOpened ? 'bg-green-500/30 text-green-300' : 'bg-primary/20 text-primary'}`}>1</span>
                <span>Click <span className="text-primary font-semibold">Open Microsoft Login</span> below — it opens a new browser tab where you sign in normally.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary/20 text-primary">2</span>
                <span>
                  Install the free <span className="text-primary font-semibold">Cookie-Editor</span> extension
                  {' '}(<a href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Chrome</a>
                  {' '}/ <a href="https://addons.mozilla.org/en-US/firefox/addon/cookie-editor/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">Firefox</a>).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary/20 text-primary">3</span>
                <span>On the <span className="text-primary">rewards.microsoft.com</span> tab after sign-in, click the Cookie-Editor icon → <span className="text-primary font-semibold">Export → Export as JSON</span>.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary/20 text-primary">4</span>
                <span>Switch to the <span className="text-primary font-semibold">Paste Cookies</span> tab here and paste the copied JSON.</span>
              </li>
            </ol>
          </div>

          <Button type="button"
            disabled={!form.email || !form.name}
            onClick={handleOpenTab}
            className="w-full font-mono text-xs uppercase bg-primary/90 hover:bg-primary text-primary-foreground">
            <Globe className="w-4 h-4 mr-2" />
            {tabOpened ? 'Open Microsoft Login Again' : 'Open Microsoft Login'}
          </Button>

          {tabOpened && (
            <div className="rounded border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-mono text-primary/80 flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
              <span>Tab opened. Sign in, export cookies with Cookie-Editor, then switch to <strong>Paste Cookies</strong> above to finish.</span>
            </div>
          )}
        </div>
      )}

      {/* ── Paste mode ── */}
      {captureMode === 'paste' && !importCookies.isSuccess && (
        <div className="space-y-3">
          <div className="rounded border border-border/30 bg-black/30 px-3 py-2.5 text-xs font-mono text-muted-foreground space-y-1.5 leading-relaxed">
            <p className="text-white/70 font-semibold">Paste your exported cookie JSON</p>
            <p>Open <span className="text-primary">rewards.microsoft.com</span>, sign in, then use Cookie-Editor → <span className="text-primary">Export → Export as JSON</span>.</p>
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

      {/* Success */}
      {importCookies.isSuccess && (
        <div className="rounded border border-green-500/30 bg-green-500/10 px-4 py-3 space-y-1 font-mono text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-green-300">Cookies imported successfully</span>
          </div>
          <p className="text-green-400/80">
            {importCookies.data.count} cookie{importCookies.data.count !== 1 ? 's' : ''} saved for{' '}
            <span className="text-green-300">{form.email}</span>
          </p>
        </div>
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
                  <Globe className="w-3.5 h-3.5" /> Capture Cookies
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
