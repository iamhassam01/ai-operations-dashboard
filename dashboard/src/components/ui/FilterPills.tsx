'use client';

interface FilterPillsProps {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
}

export function FilterPills({ options, value, onChange }: FilterPillsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1 scrollbar-hide" role="tablist">
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={`
              inline-flex items-center gap-1 rounded-full px-3 py-1.5
              text-xs font-medium whitespace-nowrap transition-colors duration-[var(--duration-fast)]
              focus-ring select-none
              ${
                isActive
                  ? 'bg-[var(--surface-accent)] text-[var(--text-accent)] border border-[var(--border-accent)]'
                  : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }
            `.trim()}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span className={`
                text-[10px] tabular-nums
                ${isActive ? 'text-[var(--text-accent)]' : 'text-[var(--text-tertiary)]'}
              `}>
                ({option.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
