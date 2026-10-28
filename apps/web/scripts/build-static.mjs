// Builds the landing page as a static site (GitHub Pages) into apps/web/out.
// The application routes need the API server, so they are set aside for the
// duration of the build and restored afterwards.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';

const aside = ['src/app/app', 'src/app/(auth)', 'src/middleware.ts'];
const stash = '.static-stash';
rmSync(stash, { recursive: true, force: true });
mkdirSync(stash);
const moved = [];
try {
  aside.forEach((p, i) => {
    if (existsSync(p)) {
      renameSync(p, `${stash}/${i}`);
      moved.push([p, `${stash}/${i}`]);
    }
  });
  rmSync('out', { recursive: true, force: true });
  execSync('next build', { stdio: 'inherit', env: { ...process.env, STATIC_EXPORT: '1', NEXT_PUBLIC_STATIC_SITE: '1' } });
} finally {
  for (const [p, s] of moved) renameSync(s, p);
  rmSync(stash, { recursive: true, force: true });
}
