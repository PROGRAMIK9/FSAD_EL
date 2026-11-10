import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronsLeft, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useNotifications } from '../../context/NotificationsContext.jsx';
import { Avatar, Button } from '../ui/index.js';
import { titleCase } from '../../lib/format.js';
import { titleFor, visibleGroups } from './nav.js';

function Brand({ compact }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-700 font-display text-lg font-extrabold text-white shadow-md">R</div>
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-[15px] font-bold text-white">RVCE Academic Hub</p>
          <p className="truncate text-xs text-sidebar-fg/70">Academic management</p>
        </div>
      )}
    </div>
  );
}

function Sidebar({ collapsed, onCollapse, mobileOpen, onClose }) {
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  const groups = visibleGroups(user.role);
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar text-sidebar-fg transition-[width,transform] duration-200 ${
          collapsed ? 'lg:w-[72px]' : 'lg:w-64'
        } w-72 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <Brand compact={collapsed} />
          <button className="rounded-md p-1.5 text-sidebar-fg/70 hover:bg-sidebar-active hover:text-white lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3 scrollbar-thin">
          {groups.map((g) => (
            <div key={g.label}>
              {!collapsed && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-fg/50">{g.label}</p>}
              <ul className="space-y-0.5">
                {g.items.map(({ label, to, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      onClick={onClose}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-fg hover:bg-sidebar-active/60 hover:text-white'
                        } ${collapsed ? 'lg:justify-center lg:px-0' : ''}`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sky-400" />}
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
                          {to === '/notifications' && unread > 0 && (
                            <span className={`ml-auto rounded-full bg-sky-500 px-1.5 text-[11px] font-bold text-white ${collapsed ? 'lg:absolute lg:right-2 lg:top-1' : ''}`}>{unread}</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/5 p-3">
          <div className={`flex items-center gap-3 rounded-lg p-2 ${collapsed ? 'lg:justify-center' : ''}`}>
            <Avatar name={user.name} />
            <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-xs text-sidebar-fg/70">{titleCase(user.role)}</p>
            </div>
            <button onClick={logout} title="Sign out" className={`rounded-md p-1.5 text-sidebar-fg/70 hover:bg-sidebar-active hover:text-white ${collapsed ? 'lg:hidden' : ''}`}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={onCollapse}
            className="mt-1 hidden w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-sidebar-fg/60 hover:bg-sidebar-active hover:text-white lg:flex"
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
        <Avatar name={user.name} size="sm" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-60 animate-scale-in rounded-xl border border-border bg-surface p-1.5 shadow-pop">
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" icon={Menu} onClick={onMenu} className="lg:hidden" aria-label="Open menu" />
        <p className="truncate text-sm text-muted">
          <span className="hidden sm:inline">Academic Hub / </span>
          <span className="font-semibold text-fg">{titleFor(pathname)}</span>
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" icon={theme === 'dark' ? Sun : Moon} onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} />
        <button onClick={() => navigate('/notifications')} className="btn btn-ghost btn-icon relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
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
      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}>
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
