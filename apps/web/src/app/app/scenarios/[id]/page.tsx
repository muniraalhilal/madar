import { Suspense } from 'react';
import ScenarioEditor from './ScenarioEditor';

/**
 * The static export prebuilds one page ("view") that reads the id from ?id=;
 * with a server, any id in the path renders on demand.
 */
export function generateStaticParams() {
  return [{ id: 'view' }];
}

export default function Page() {
  return (
    <Suspense>
      <ScenarioEditor />
    </Suspense>
  );
}
