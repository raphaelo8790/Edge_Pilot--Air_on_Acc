import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pin the workspace root to this directory.
 *
 * Turbopack infers a root by walking up looking for lockfiles. A stray
 * package-lock.json in the user's home directory made it choose C:\Users\<you>,
 * which put every copy of this project inside "the project" at once - so a
 * build running from one folder resolved modules out of another, and Next
 * reported missing modules with paths belonging to a different checkout.
 *
 * Inference is the wrong mechanism for something this consequential. This
 * states it.
 * https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack
 */
const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  turbopack: {
    root: projectRoot,
  },

  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually reached by the traced imports. The Dockerfile copies
  // that instead of the whole dependency tree, which is what keeps the runtime
  // image small and free of build tooling.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: 'standalone',
};

export default nextConfig;
