'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline-accent';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--interactive-primary)] text-[var(--text-inverse)] hover:bg-[var(--interactive-primary-hover)] active:bg-[var(--interactive-primary-active)]',
  secondary:
    'bg-[var(--interactive-secondary)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--interactive-secondary-hover)] hover:border-[var(--border-hover)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--interactive-ghost-hover)] hover:text-[var(--text-primary)]',
  destructive:
    'bg-[var(--interactive-destructive)] text-[var(--text-inverse)] hover:brightness-110 active:brightness-125',
  'outline-accent':
    'bg-transparent text-[var(--text-accent)] border border-[var(--border-accent)] hover:bg-[var(--surface-accent)]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-10 px-5 text-sm gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      icon,
      iconRight,
      children,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center font-medium rounded-[var(--radius-md)]
          transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]
          focus-ring cursor-pointer select-none
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'hover:-translate-y-px active:translate-y-0'}
          ${className}
        `.trim()}
        {...props}
      >
        {loading ? (
          <>
            <span className="spinner shrink-0" style={{ width: size === 'sm' ? 14 : 16, height: size === 'sm' ? 14 : 16 }} />
            {loadingText || children}
          </>
        ) : (
          <>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
            {iconRight && <span className="shrink-0">{iconRight}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
