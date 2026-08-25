/**
 * Sentry Edge Configuration
 * 
 * Configures Sentry for edge runtime error tracking.
 * 
 * @module sentry.edge.config
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
  environment: process.env.NODE_ENV,
});
