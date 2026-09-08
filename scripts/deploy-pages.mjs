#!/usr/bin/env node
/**
 * Publish `dist/` to the `gh-pages` branch.
 *
 * Used instead of a GitHub Actions workflow so the project can be deployed with
 * a plain `repo`-scoped token (adding files under .github/workflows/ requires the
 * extra `workflow` scope). `ci/github-pages.yml.example` holds the equivalent
 * Actions workflow for anyone whose token does carry that scope.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', ...opts });

if (!existsSync('dist/index.html')) {
  console.error('dist/ is missing or empty — run `npm run build` first.');
  process.exit(1);
}

run('git', ['--work-tree', 'dist', 'checkout', '--orphan', 'gh-pages-tmp']);
run('git', ['--work-tree', 'dist', 'add', '-A']);
run('git', ['--work-tree', 'dist', 'commit', '-m', 'Deploy to GitHub Pages']);
run('git', ['push', 'origin', 'HEAD:gh-pages', '--force']);
run('git', ['checkout', '-f', 'main']);
run('git', ['branch', '-D', 'gh-pages-tmp']);
console.log('\nDeployed. Pages will refresh in about a minute.');
