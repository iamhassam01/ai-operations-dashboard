'use client';

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';

/* ═══════════════════════════════════════════════════ */
/*  Text Input                                         */
/* ═══════════════════════════════════════════════════ */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  required?: boolean;
}

const baseInputStyles = `
  w-full h-9 rounded-[var(--radius-md)]
  border border-[var(--border-default)]
  bg-[var(--surface-primary)]
  text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]
  text-sm leading-[var(--leading-body)]
  transition-colors duration-[var(--duration-fast)]
  focus:outline-none focus:border-[var(--border-focus)] focus:shadow-[var(--shadow-focus)]
  disabled:opacity-50 disabled:bg-[var(--surface-secondary)] disabled:cursor-not-allowed
`;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, required, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            {label}{required && <span className="text-[var(--text-accent)] ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`
              ${baseInputStyles}
              ${icon ? 'pl-9' : 'px-3'}
              ${!icon ? 'pr-3' : 'pr-3'}
              ${error ? 'border-error focus:border-error' : ''}
              ${className}
            `.trim()}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-error-muted">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

/* ═══════════════════════════════════════════════════ */
/*  Textarea                                           */
/* ═══════════════════════════════════════════════════ */

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full rounded-[var(--radius-md)]
            border border-[var(--border-default)]
            bg-[var(--surface-primary)]
            text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]
            text-sm leading-[var(--leading-body)] px-3 py-2 resize-none
            transition-colors duration-[var(--duration-fast)]
            focus:outline-none focus:border-[var(--border-focus)] focus:shadow-[var(--shadow-focus)]
            disabled:opacity-50 disabled:bg-[var(--surface-secondary)]
            ${error ? 'border-error' : ''}
            ${className}
          `.trim()}
          {...props}
        />
        {error && <p className="text-xs text-error-muted">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

/* ═══════════════════════════════════════════════════ */
/*  Select                                             */
/* ═══════════════════════════════════════════════════ */

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', required, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            {label}{required && <span className="text-[var(--text-accent)] ml-0.5">*</span>}
          </label>
        )}
        <select
          ref={ref}
          className={`
            ${baseInputStyles} px-3 appearance-none
            bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394A3B8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
            bg-no-repeat bg-[right_0.75rem_center] pr-8
            ${error ? 'border-error' : ''}
            ${className}
          `.trim()}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-error-muted">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
