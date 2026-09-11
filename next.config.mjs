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

  // Hides Next's floating dev-tools badge, which sits in the bottom-left
  // corner during `next dev`. It never appears in a production build, so this
  // only affects what you see while developing — it is off because it
  // overlaps the page's own bottom-left content.
  devIndicators: false,

  turbopack: {
    root: projectRoot,
  },

  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually reached by the traced imports. The Dockerfile copies
  // that instead of the whole dependency tree, which is what keeps the runtime
  // image small and free of build tooling.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: 'standalone',

  // sharp is a NATIVE module: a small JS wrapper in front of libvips, shipped
  // as one prebuilt binary per platform. Left to itself the bundler turns it
  // into an anonymous external chunk and traces only the JavaScript, so the
  // deployed function calls dlopen on a libvips-cpp.so that was never copied
  // and dies with ERR_DLOPEN_FAILED at request time.
  //
  // This is NOT an install problem. package-lock.json carries every @img
  // platform package, and `npm ci` on a linux-x64 host installs a working
  // sharp. The binary exists at build time and simply does not travel.
  //
  // Naming it here keeps it a real runtime require that file tracing
  // understands and follows into the bundle.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
  serverExternalPackages: ['sharp'],

  // The built-in vision dataset is read from disk at request time by the
  // dataset routes and the vision server action. A traced (Vercel or
  // standalone) build only ships files it can see imported, and a readFile
  // path is not an import - so without this the hosted site has no images
  // to serve and every built-in run fails with ENOENT.
  //
  // The @img entries are belt-and-braces for the same failure above: tracing
  // should now follow sharp on its own, and these guarantee the linux binary
  // ships even if it does not. The globs match nothing on a Windows or macOS
  // checkout, which is harmless - a tracing include that matches no file is
  // skipped, not an error.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats
  outputFileTracingIncludes: {
    '/api/v1/vision-benchmarks/**': ['./datasets/vision-benchmark/**'],
    '/vision-benchmark': [
      './datasets/vision-benchmark/**',
      './node_modules/@img/sharp-linux-x64/**',
      './node_modules/@img/sharp-libvips-linux-x64/**',
    ],
  },
};

export default nextConfig;
