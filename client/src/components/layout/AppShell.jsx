import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronsLeft, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useNotifications } from '../../context/NotificationsContext.jsx';
import { Avatar, Button, Logo } from '../ui/index.js';
import { titleCase } from '../../lib/format.js';
import { titleFor, visibleGroups } from './nav.js';

/** RV crest with the college name and "Academic Hub" in the accent serif. */
export function Brand({ compact }) {
  return <Logo compact={compact} />;
}

/** Open review requests for staff, refreshed on navigation and when one is resolved. */
function useOpenReviews(role) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(0);
  useEffect(() => {
    if (role !== 'teacher' && role !== 'admin') return undefined;
    let alive = true;
    const load = () =>
      api
        .get('/grade-reviews/summary')
        .then((d) => alive && setOpen(d.open))
        .catch(() => {});
    load();
    window.addEventListener('reviews:changed', load);
    return () => {
      alive = false;
      window.removeEventListener('reviews:changed', load);
    };
  }, [role, pathname]);
  return open;
}

function Sidebar({ collapsed, onCollapse, mobileOpen, onClose }) {
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  const openReviews = useOpenReviews(user.role);
  const badges = { '/notifications': unread, '/reviews': openReviews };
  const groups = visibleGroups(user.role);
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 animate-fade-in bg-slate-950/40 backdrop-blur-[2px] lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-sidebar transition-[width,transform] duration-200 ${
          collapsed ? 'lg:w-[80px]' : 'lg:w-64'
        } w-72 ${mobileOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className={`flex h-[72px] items-center justify-between gap-2 px-5 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
          <Brand compact={collapsed} />
          <button className="btn btn-ghost btn-icon lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-3 scrollbar-thin">
          {groups.map((g) => (
            <div key={g.label}>
              {!collapsed && <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">{g.label}</p>}
              <ul className="space-y-1">
                {g.items.map(({ label, to, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      onClick={onClose}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium transition ${
                          isActive ? 'bg-ink font-semibold text-ink-fg' : 'text-sidebar-fg hover:bg-surface-2 hover:text-fg'
                        } ${collapsed ? 'lg:justify-center lg:px-0' : ''}`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-tile-green' : 'text-subtle group-hover:text-fg'}`} />
                          <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
                          {badges[to] > 0 ? (
                            <span className={`ml-auto rounded-full px-1.5 text-[11px] font-bold text-tile-ink ${to === '/reviews' ? 'bg-tile-yellow' : 'bg-tile-pink'} ${collapsed ? 'lg:absolute lg:right-2 lg:top-1' : ''}`}>{badges[to]}</span>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="p-3">
          <div className={`flex items-center gap-3 rounded-full bg-tile-lavender p-1.5 pr-2 text-tile-ink ${collapsed ? 'lg:justify-center lg:bg-transparent lg:p-1' : ''}`}>
            <Avatar name={user.name} />
            <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-tile-ink/70">{titleCase(user.role)}</p>
            </div>
            <button onClick={logout} title="Sign out" aria-label="Sign out" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-tile-ink/60 transition hover:bg-tile-ink hover:text-white ${collapsed ? 'lg:hidden' : ''}`}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={onCollapse}
            className="mt-2 hidden w-full items-center justify-center gap-2 rounded-xl py-1.5 text-xs font-medium text-subtle hover:bg-surface-2 hover:text-fg lg:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronsLeft className={`h-4 w-4 transition ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>
    </>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-full" aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={user.name} size="sm" ring />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-64 animate-scale-in rounded-2xl border border-border bg-surface p-1.5 shadow-pop">
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            {user.usn && <p className="mt-0.5 font-mono text-xs text-subtle">{user.usn}</p>}
          </div>
          <button role="menuitem" onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Topbar({ onMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { unread } = useNotifications();
  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 bg-bg/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="secondary" icon={Menu} onClick={onMenu} className="lg:hidden" aria-label="Open menu" />
        <span className="hidden truncate rounded-full border border-fg/15 bg-surface px-4 py-1.5 text-sm font-semibold text-fg sm:inline-block">{titleFor(pathname)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" icon={theme === 'dark' ? Sun : Moon} onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} />
        <button onClick={() => navigate('/notifications')} className="btn btn-secondary btn-icon relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-tile-pink px-1 text-[10px] font-bold text-tile-ink">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <div className="ml-1">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onCollapse={toggleCollapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[80px]' : 'lg:pl-64'}`}>
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
