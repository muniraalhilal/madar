import { Suspense } from 'react';
import RunResult from './RunResult';

/**
 * The static export prebuilds one page ("view") that reads the id from ?id=;
 * with a server, any id in the path renders on demand.
 */
export function generateStaticParams() {
  return [{ runId: 'view' }];
}

export default function Page() {
  return (
    <Suspense>
      <RunResult />
    </Suspense>
  );
}
