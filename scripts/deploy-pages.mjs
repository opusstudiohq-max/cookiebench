#!/usr/bin/env node
/**
 * Publish `dist/` to the `gh-pages` branch.
 *
 * Used instead of a GitHub Actions workflow so the project deploys with a plain
 * `repo`-scoped token — adding files under `.github/workflows/` requires the extra
 * `workflow` scope. `ci/github-pages.yml.example` holds the equivalent Actions
 * workflow for anyone whose token does carry that scope.
 *
 * `dist/` is turned into a throwaway git repository and force-pushed. Nothing
 * touches the working repository, so an interrupted deploy cannot corrupt `main`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';

const DIST = 'dist';
const run = (args, opts = {}) => execFileSync('git', args, { stdio: 'inherit', ...opts });
const capture = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (!existsSync(`${DIST}/index.html`)) {
  console.error('dist/index.html is missing — run `npm run build` first.');
  process.exit(1);
}

const remote = process.env.DEPLOY_REMOTE ?? capture(['remote', 'get-url', 'origin']);
if (!remote) {
  console.error('No `origin` remote found. Set DEPLOY_REMOTE to the target repository URL.');
  process.exit(1);
}

// Stop the build output from being treated as a Jekyll site, which would drop
// any underscore-prefixed asset.
writeFileSync(`${DIST}/.nojekyll`, '');

// Start from a clean slate so a previous run's metadata is never reused.
rmSync(`${DIST}/.git`, { recursive: true, force: true });

const inDist = { cwd: DIST };
run(['init', '-q', '-b', 'gh-pages'], inDist);
run(['add', '-A'], inDist);
run(['-c', 'user.name=cookiebench-deploy', '-c', 'user.email=deploy@localhost',
     'commit', '-q', '-m', 'Deploy to GitHub Pages'], inDist);
run(['push', '--force', '--quiet', remote, 'gh-pages:gh-pages'], inDist);

// Leave no git metadata behind in the build directory.
rmSync(`${DIST}/.git`, { recursive: true, force: true });

console.log('\nDeployed to gh-pages. GitHub Pages usually refreshes within a minute.');
