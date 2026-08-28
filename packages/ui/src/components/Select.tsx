import type { SelectHTMLAttributes } from 'react';

type SelectOption = { value: string; label: string };

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
};

export function Select({
  label,
  options,
  error,
  placeholder,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <select
        id={selectId}
        {...props}
        className={[
          'block w-full rounded-md border px-3 py-2 text-sm shadow-sm bg-white',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
          'disabled:bg-gray-50 disabled:cursor-not-allowed',
          error ? 'border-red-300' : 'border-border',
          className,
        ].join(' ')}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
