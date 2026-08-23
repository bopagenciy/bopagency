import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

/**
 * Variantes — Phase 8A.0 (Branding & Theming Foundation).
 *
 * `primary` usa el naranja corporativo (`--primary`, ver globals.css) — NO
 * un hex hardcodeado. `danger` sigue usando el rojo semántico de Tailwind
 * (destructivo/error) deliberadamente separado de la marca — ver principio
 * F del mandato de 8A.0 ("brand colors and semantic colors are different
 * concepts").
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary disabled:bg-primary/40',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-muted focus:ring-primary disabled:opacity-50 border border-border',
  ghost: 'bg-transparent text-foreground hover:bg-muted focus:ring-primary',
  danger:
    'bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 focus:ring-destructive',
  outline:
    'bg-background text-foreground border border-border hover:bg-muted focus:ring-primary',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      className={[
        'inline-flex items-center gap-2 rounded-md font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
