import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Lock, Sparkles, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../hooks/useApi.js';
import { Button, Card, Modal, Switch } from '../ui/index.js';
import { hueFor } from './QuizCard.jsx';

/** Dialog where a student picks one subject of an elective group. */
export function ElectiveChooser({ group, onClose, onChosen }) {
  const [selected, setSelected] = useState(group.choice || null);
  const [busy, setBusy] = useState(false);
  const pick = group.options.find((o) => o._id === selected);

  const confirm = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await api.post('/me/electives', { subjectId: pick._id });
      toast.success(`You are enrolled in ${pick.name}`);
      onChosen?.();
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title={`Choose your Group ${group.group} elective`}
      description="Pick one. You can change it until the department closes elective choices."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Later</Button>
          <Button variant="primary" icon={Check} disabled={!pick || pick._id === group.choice} loading={busy} onClick={confirm}>
            {pick ? `Enrol in ${pick.code}` : 'Choose an elective'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Electives">
        {group.options.map((o) => {
          const active = o._id === selected;
          return (
            <button
              key={o._id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(o._id)}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border text-left transition ${active ? 'border-primary shadow-hero ring-2 ring-primary' : 'border-border hover:-translate-y-0.5 hover:shadow-lift'}`}
            >
              <div className={`card-hero ${hueFor(o.code)} !rounded-none px-4 pb-4 pt-3.5 !shadow-none`}>
                <div className="flex items-center justify-between">
                  <span className="chip chip-light">{o.code}</span>
                  <span className={`grid h-6 w-6 place-items-center rounded-full border-2 border-white ${active ? 'bg-white text-[#0F62D9]' : ''}`}>{active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                </div>
                <p className="mt-2 font-display text-[15px] font-bold leading-snug">{o.name}</p>
              </div>
              <div className="flex-1 bg-surface px-4 py-3">
                <ol className="space-y-1 text-xs text-muted">
                  {o.units.map((u, i) => (
                    <li key={u} className="truncate">
                      <span className="mr-1.5 font-semibold text-fg">{['I', 'II', 'III', 'IV', 'V'][i] || i + 1}</span>
                      {u}
                    </li>
                  ))}
                </ol>
                <p className="mt-2.5 flex items-center gap-1.5 text-xs text-subtle">
                  <Users className="h-3.5 w-3.5" /> {o.students} enrolled · {o.credits} credits
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/** Student prompt: asks for a choice when one is missing, or offers to change it. */
export function ElectivePrompt({ onChosen, compact = false }) {
  const { data: groups, reload } = useApi('/me/electives', { initial: [] });
  const [open, setOpen] = useState(null);
  const pending = groups.filter((g) => !g.choice && !g.locked);
  const changeable = groups.filter((g) => g.choice && !g.locked);
  const closed = groups.filter((g) => !g.choice && g.locked);
  const done = () => {
    reload();
    onChosen?.();
  };

  if (!groups.length) return null;
  return (
    <>
      {pending.map((g) => (
        <section key={g.group} className="card-hero hero-indigo mb-6 flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20">
            <Sparkles className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold">Choose your Group {g.group} elective</p>
            <p className="text-sm text-white/85">{g.options.map((o) => o.name).join(' · ')}</p>
          </div>
          <Button variant="ink" onClick={() => setOpen(g)}>
            Choose now
          </Button>
        </section>
      ))}
      {closed.map((g) => (
        <Card key={g.group} className="mb-6 flex items-center gap-3 p-4 text-sm">
          <Lock className="h-4 w-4 shrink-0 text-warn" />
          Group {g.group} elective choices are closed and you have not chosen one. Contact the department administrator.
        </Card>
      ))}
      {compact &&
        changeable.map((g) => (
          <Button key={g.group} size="sm" onClick={() => setOpen(g)}>
            Change Group {g.group} elective
          </Button>
        ))}
      {open && <ElectiveChooser group={open} onClose={() => setOpen(null)} onChosen={done} />}
    </>
  );
}

/** Admin card: how many students picked each elective, and the lock switch. */
export function ElectiveAdminCard() {
  const { data: groups, reload } = useApi('/admin/electives', { initial: [] });
  const [busy, setBusy] = useState(null);
  const toggle = async (g) => {
    setBusy(g.group);
    try {
      await api.post(`/admin/electives/${g.group}/${g.locked ? 'unlock' : 'lock'}`);
      toast.success(g.locked ? `Group ${g.group} choices reopened` : `Group ${g.group} choices closed`);
      reload();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
    }
  };
  return groups.map((g) => {
    const max = Math.max(1, ...g.options.map((o) => o.students));
    return (
      <Card key={g.group} className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-[15px] font-semibold">Group {g.group} electives</p>
            <p className="text-sm text-muted">
              {g.students - g.unchosen} of {g.students} students have chosen{g.unchosen ? `, ${g.unchosen} still to choose` : ''}.
            </p>
          </div>
          <Switch label={g.locked ? 'Choices closed' : 'Students can choose'} checked={!g.locked} disabled={busy === g.group} onChange={() => toggle(g)} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {g.options.map((o) => (
            <div key={o._id} className="rounded-2xl bg-surface-2 p-3.5">
              <p className="truncate text-sm font-semibold">{o.name}</p>
              <p className="font-mono text-xs text-muted">{o.code}</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(o.students / max) * 100}%` }} />
                </div>
                <span className="font-display text-sm font-bold tabular">{o.students}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  });
}
