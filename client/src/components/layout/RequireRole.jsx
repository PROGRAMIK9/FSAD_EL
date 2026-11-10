import { ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card, EmptyState } from '../ui/index.js';

/** Renders children only for the listed roles; the server still enforces every permission. */
export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user.role))
    return (
      <Card>
        <EmptyState icon={ShieldOff} title="You don't have access to this page" description="This area is limited to other roles. If you think this is a mistake, contact your administrator." action={<Button to="/">Back to dashboard</Button>} />
      </Card>
    );
  return children;
}
