// Builds the static site (GitHub Pages) into apps/web/out: the landing page and
// the application in demo mode, where the engine runs in the visitor's browser.
// Routes that need the API server are set aside for the build and restored.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';

// Sign-in pages and the session cookie gate need the API; the demo has no accounts.
const aside = ['src/app/(auth)', 'src/middleware.ts'];
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
