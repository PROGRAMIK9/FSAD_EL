import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from './Feedback.jsx';

const variants = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export const Button = forwardRef(function Button(
  { variant = 'secondary', size, icon: Icon, loading = false, to, className = '', children, disabled, ...props },
  ref,
) {
  const cls = `btn ${variants[variant]} ${size === 'sm' ? 'btn-sm' : ''} ${!children ? 'btn-icon' : ''} ${className}`;
  const content = (
    <>
      {loading ? <Spinner className="h-4 w-4" /> : Icon ? <Icon aria-hidden /> : null}
      {children}
    </>
  );
  if (to)
    return (
      <Link ref={ref} to={to} className={cls} {...props}>
        {content}
      </Link>
    );
  return (
    <button ref={ref} type="button" className={cls} disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
});
