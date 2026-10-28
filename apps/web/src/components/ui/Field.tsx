import { cn } from '@/lib/cn';

export function Field({ label, error, hint, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm text-sand/80">
        {label}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={cn(
          'mt-2 block w-full rounded-xl border bg-night-2 px-4 py-3 text-base text-sand placeholder:text-sand/30 transition-colors focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-lavender/60',
          error ? 'border-danger/70' : 'border-line-dark hover:border-lavender-soft/40',
        )}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-sand/50">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
