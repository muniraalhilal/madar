import Link from 'next/link';
import { appHref, STATIC_SITE } from '@/lib/site';

/** A link into the application; on the static demo site it opens the setup guide. */
export function AppLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  const { href, external } = appHref(to);
  if (external)
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer" title={STATIC_SITE ? 'The full app runs locally — opens the setup guide' : undefined}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
