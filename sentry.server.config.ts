/**
 * Sentry Server Configuration
 * 
 * Configures Sentry for server-side error tracking.
 * 
 * @module sentry.server.config
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
  environment: process.env.NODE_ENV,
});
