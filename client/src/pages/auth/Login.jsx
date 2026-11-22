import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FlaskConical, Moon, Sun } from 'lucide-react';
import { api } from '../../lib/api.js';
import { loadGoogleIdentity } from '../../lib/google.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Accent, Alert, Badge, Button, CircleBadge, Crest, Logo, Shape, Spinner, Squiggle, TagPill, Tile } from '../../components/ui/index.js';

const features = [
  { tone: 'green', chip: 'Live', title: 'Proctored', accent: 'Quizzes', shape: 'flower', text: 'Timed, auto-saved and monitored live by faculty.' },
  { tone: 'lavender', chip: 'C · C++ · Java · Python', title: 'Coding', accent: 'Labs', shape: 'blob', text: 'Write, run and auto-grade code in the browser.' },
  { tone: 'lime', chip: 'CIE', title: 'Results &', accent: 'Analytics', shape: 'asterisk', text: 'Instant scoring with question-level insight.' },
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
    <form onSubmit={submit} className="mt-8 rounded-3xl border border-dashed border-warn/50 bg-warn-soft/40 p-4">
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
              if (result.created) toast.success(`Welcome, ${result.user.name.split(' ')[0]}! Your student account is ready.`, { duration: 6000 });
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
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.15fr_1fr]">
      <section className="relative m-3 hidden overflow-hidden rounded-[2rem] bg-surface p-10 lg:flex lg:flex-col xl:p-12">
        <Squiggle className="absolute inset-x-0 top-40 -z-0 h-40 w-full text-tile-lime" />
        <div className="relative flex items-center justify-between">
          <img src="/brand/rv-lockup.png" alt="RV College of Engineering" className="h-14 w-auto dark:hidden" />
          <img src="/brand/rv-lockup-white.png" alt="RV College of Engineering" className="hidden h-14 w-auto dark:block" />
        </div>
        <div className="relative mt-14 flex items-start gap-6">
          <h1 className="max-w-lg text-[3.1rem] font-bold leading-[1.02] tracking-tight text-fg">
            <span className="inline-flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-tile-lime">
                <Shape shape="asterisk" className="h-6 w-6 text-tile-ink" />
              </span>
              Academic
            </span>
            <Accent className="block text-[3.4rem]">Hub for RVCE</Accent>
          </h1>
          <CircleBadge className="mt-2 h-28 w-28">
            <Crest className="h-12 w-12" color="black" />
          </CircleBadge>
        </div>
        <p className="relative mt-4 max-w-md text-sm text-muted">Teaching, assessment and results in one place: proctored quizzes, coding labs and CIE marks.</p>
        <div className="relative mt-6 flex flex-wrap gap-2">
          <TagPill tone="pink" rotate={-4}>
            #Quiz
          </TagPill>
          <TagPill tone="lavender" rotate={3}>
            #C++
          </TagPill>
          <TagPill tone="green" rotate={-2}>
            #Python
          </TagPill>
          <TagPill tone="yellow" rotate={4}>
            #CIE
          </TagPill>
        </div>
        <div className="relative mt-auto grid grid-cols-3 gap-4 pt-10">
          {features.map((f, i) => (
            <Tile key={f.title} tone={f.tone} chip={f.chip} title={f.title} accent={f.accent} shape={f.shape} arrow className={`min-h-[13rem] ${i === 1 ? '-translate-y-6' : ''}`}>
              <p className="mt-2 text-xs font-medium text-tile-ink/75">{f.text}</p>
            </Tile>
          ))}
        </div>
        <Shape shape="heart" className="absolute bottom-[17rem] right-14 h-9 w-9 rotate-12 text-tile-pink" />
        <Shape shape="star" className="absolute right-40 top-24 h-6 w-6 text-tile-lavender" />
      </section>

      <section className="relative flex items-center justify-center px-5 py-12">
        <Button variant="secondary" icon={theme === 'dark' ? Sun : Moon} onClick={toggle} className="absolute right-4 top-4" aria-label="Toggle theme" />
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-[2.4rem] font-bold leading-[1.05] tracking-tight">
            Welcome <Accent>back</Accent>
          </h2>
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
              Set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> and the matching server <code className="font-mono">GOOGLE_CLIENT_ID</code>.
            </Alert>
          )}
          <DevLogin onSignedIn={setUser} />
          <p className="mt-10 text-xs leading-relaxed text-subtle">Any verified account from an approved RVCE domain can sign in. New accounts start as students; your department administrator assigns teacher or admin access.</p>
        </div>
      </section>
    </div>
  );
}
