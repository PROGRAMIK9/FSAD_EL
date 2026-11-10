import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { NotificationsProvider } from './context/NotificationsContext.jsx';
import { ConfirmProvider } from './components/ui/index.js';
import { AppShell } from './components/layout/AppShell.jsx';
import { PageLoader } from './components/layout/PageLoader.jsx';
import { RequireRole } from './components/layout/RequireRole.jsx';
import Login from './pages/auth/Login.jsx';
import { appRoutes, fullscreenRoutes } from './routes.jsx';

function guard({ roles, element }) {
  return roles ? <RequireRole roles={roles}>{element}</RequireRole> : element;
}

function AuthedApp() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader label="Loading your workspace…" />;
  if (!user) return <Login />;
  return (
    <NotificationsProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {fullscreenRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={guard(r)} />
          ))}
          <Route
            path="*"
            element={
              <AppShell>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {appRoutes.map((r) => (
                      <Route key={r.path} path={r.path} element={guard(r)} />
                    ))}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </AppShell>
            }
          />
        </Routes>
      </Suspense>
    </NotificationsProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ConfirmProvider>
          <AuthedApp />
          <Toaster
            position="top-right"
            toastOptions={{
              className: '!bg-surface !text-fg !border !border-border !shadow-pop !text-sm',
              success: { iconTheme: { primary: 'rgb(var(--c-success))', secondary: 'white' } },
              error: { iconTheme: { primary: 'rgb(var(--c-danger))', secondary: 'white' } },
            }}
          />
        </ConfirmProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
