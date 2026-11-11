import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BarChart3, ClipboardCheck, FlaskConical, Moon, ShieldCheck, Sun } from 'lucide-react';
import { api } from '../../lib/api.js';
import { loadGoogleIdentity } from '../../lib/google.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Alert, Badge, Button, Spinner } from '../../components/ui/index.js';
import { Brand } from '../../components/layout/AppShell.jsx';

const features = [
  { icon: ClipboardCheck, title: 'Proctored quizzes', text: 'Timed, auto-saved and monitored live by faculty.' },
  { icon: BarChart3, title: 'Results & analytics', text: 'Instant scoring with question-level insight.' },
  { icon: ShieldCheck, title: 'Institution sign-in', text: 'Only pre-provisioned RVCE accounts can enter.' },
];

function DevLogin({ onSignedIn }) {
  const [state, setState] = useState({ enabled: false, users: [] });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get('/auth/dev-login')
      .then((r) => {
        setState(r);
        setEmail(r.users[0]?.email || '');
      })
      .catch(() => {});
  }, []);
  if (!state.enabled) return null;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api.post('/auth/dev-login', { email });
      onSignedIn(result.user);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-8 rounded-xl border border-dashed border-warn/50 bg-warn-soft/40 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-warn">
        <FlaskConical className="h-4 w-4" /> Development sign-in <Badge tone="warn">DEV_LOGIN</Badge>
      </p>
      {state.users.length ? (
        <div className="flex gap-2">
          <select className="input" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Account">
            {state.users.map((u) => (
              <option key={u.email} value={u.email}>
                {u.role} · {u.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary" loading={busy}>
            Enter
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">No active accounts. Run the seed with SEED_ACTIVATE=true.</p>
      )}
    </form>
  );
}

export default function Login() {
  const { setUser } = useAuth();
  const { theme, toggle } = useTheme();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const buttonRef = useRef(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    loadGoogleIdentity()
      .then((gis) => {
        if (!active || !buttonRef.current) return;
        gis.initialize({
          client_id: clientId,
          callback: async (response) => {
            setBusy(true);
            try {
              const result = await api.post('/auth/google', { credential: response.credential });
              setUser(result.user);
            } catch (err) {
              toast.error(String(err));
            } finally {
              setBusy(false);
            }
          },
        });
        gis.renderButton(buttonRef.current, { theme: theme === 'dark' ? 'filled_black' : 'outline', size: 'large', shape: 'pill', width: 320, text: 'signin_with' });
        setReady(true);
      })
      .catch(() => toast.error('Google sign-in could not load'));
    return () => {
      active = false;
    };
  }, [clientId, setUser, theme]);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="card-hero m-3 hidden !rounded-[2rem] p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -bottom-28 -left-20 -z-10 h-80 w-80 rounded-full bg-white/10" />
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white font-display text-xl font-extrabold text-[#0F62D9]">R</div>
          <span className="font-display text-lg font-bold">
            Academic Hub <span className="font-medium text-white/75">· RVCE</span>
          </span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[2.6rem] font-bold leading-[1.1]">Teaching, assessment and results in one place.</h1>
          <ul className="mt-10 space-y-6">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/25">
                  <Icon className="h-5 w-5 text-white" />
                </span>
                <span>
                  <span className="block font-display font-semibold">{title}</span>
                  <span className="text-sm text-white/85">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/70">R V College of Engineering, Bengaluru</p>
      </section>

      <section className="relative flex items-center justify-center px-5 py-12">
        <Button variant="ghost" icon={theme === 'dark' ? Sun : Moon} onClick={toggle} className="absolute right-4 top-4" aria-label="Toggle theme" />
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Brand />
          </div>
          <h2 className="text-3xl font-bold">Welcome back</h2>
          <p className="mt-2 text-muted">Sign in with your authorised RVCE Google account.</p>
          <div className="mt-8 flex min-h-[44px] items-center">
            <div ref={buttonRef} />
            {clientId && !ready && <Spinner className="h-5 w-5 text-muted" />}
          </div>
          {busy && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted">
              <Spinner className="h-4 w-4" /> Verifying your account…
            </p>
          )}
          {!clientId && (
            <Alert tone="warn" title="Google sign-in is not configured" className="mt-2">
              Set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> and the matching server <code className="font-mono">GOOGLE_CLIENT_ID</code>. Accounts must be provisioned by an administrator.
            </Alert>
          )}
          <DevLogin onSignedIn={setUser} />
          <p className="mt-10 text-xs leading-relaxed text-subtle">Only verified, pre-provisioned accounts from configured RVCE domains can sign in. Contact your department administrator for access.</p>
        </div>
      </section>
    </div>
  );
}
