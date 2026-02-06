import { type ReactNode } from 'react';

type CardVariant = 'default' | 'interactive' | 'accent' | 'ghost';

interface CardProps {
  variant?: CardVariant;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: boolean;
}

const variantStyles: Record<CardVariant, string> = {
  default:
    'bg-[var(--surface-primary)] border border-[var(--border-default)] rounded-[var(--radius-md)]',
  interactive:
    'bg-[var(--surface-primary)] border border-[var(--border-default)] rounded-[var(--radius-md)] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-xs)] transition-all duration-[var(--duration-normal)] cursor-pointer',
  accent:
    'bg-[var(--surface-accent)] border border-[var(--border-accent)] rounded-[var(--radius-md)]',
  ghost:
    'rounded-[var(--radius-md)]',
};

export function Card({
  variant = 'default',
  children,
  className = '',
  onClick,
  padding = true,
}: CardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        ${variantStyles[variant]}
        ${padding ? 'p-4' : ''}
        ${onClick ? 'text-left w-full focus-ring' : ''}
        ${className}
      `.trim()}
    >
      {children}
    </Component>
  );
}
