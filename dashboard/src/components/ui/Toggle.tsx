'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Toggle({ checked, onChange, label, description, disabled = false, id }: ToggleProps) {
  const toggleId = id || `toggle-${label?.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <label
      htmlFor={toggleId}
      className={`flex items-center justify-between gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && <span className="block text-sm font-medium text-[var(--text-primary)]">{label}</span>}
          {description && <span className="block text-xs text-[var(--text-tertiary)] mt-0.5">{description}</span>}
        </div>
      )}
      <button
        id={toggleId}
        role="switch"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full
          transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]
          focus-ring
          ${checked ? 'bg-[var(--interactive-primary)]' : 'bg-[var(--border-default)]'}
          ${disabled ? 'pointer-events-none' : ''}
        `.trim()}
      >
        <span
          className={`
            inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm
            transition-transform duration-[var(--duration-fast)] ease-[var(--ease-default)]
            ${checked ? 'translate-x-[20px]' : 'translate-x-[2px]'}
          `.trim()}
        />
      </button>
    </label>
  );
}
