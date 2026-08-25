/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Emits .next/standalone with a self-contained server.js and only the
  // node_modules actually reached by the traced imports. The Dockerfile copies
  // that instead of the whole dependency tree, which is what keeps the runtime
  // image small and free of build tooling.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: 'standalone',
};

export default nextConfig;
