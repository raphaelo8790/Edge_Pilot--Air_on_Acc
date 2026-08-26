/**
 * GET /api/v1/providers — the provider catalog, plus whether each one is
 * usable on this server right now.
 *
 * The catalog rows come from the database when it is reachable, so
 * `provider_id` is the real uuid a benchmark row will reference. When the
 * database is not reachable the endpoint still answers, from the registry
 * alone, with `provider_id: null` and a message saying why — the dashboard
 * can still render the list and say which providers are configured.
 *
 * No credential, and no fragment of one, appears in this response.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  benchmarkConfigWarnings,
  benchmarkRegistry,
} from '@/modules/benchmark/infrastructure/container';
import { logForRequest } from '@/core/logging/sessionLogStore';
import { visitorKeysFrom } from '@/modules/benchmark/infrastructure/visitor-keys';

export const dynamic = 'force-dynamic';

interface ProviderRow {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  isActive: boolean;
}

export async function GET(request: Request) {
  // Takes the request only to resolve the session log.
  const log = logForRequest(request);

  try {
    // "configured" answers for THIS visitor: their own key counts, and is
    // used for this request only.
    const availability = benchmarkRegistry(visitorKeysFrom(request)).availability();
    const warnings = benchmarkConfigWarnings();

    let catalog: ProviderRow[] = [];
    let databaseAvailable = true;

    try {
      catalog = await prisma.provider.findMany({ orderBy: { name: 'asc' } });
    } catch {
      databaseAvailable = false;
    }

    const catalogByName = new Map(catalog.map((row) => [row.name, row]));

    const data = availability.map((provider) => {
      const row = catalogByName.get(provider.name);

      return {
        // Unchanged field names: the scaffold's shape is what the dashboard
        // already reads.
        provider_id: row?.id ?? null,
        name: provider.name,
        type: provider.type,
        base_url: row?.baseUrl ?? provider.baseUrl,
        is_active: row?.isActive ?? true,

        // Added fields.
        display_name: provider.displayName,
        is_configured: provider.isConfigured,
        configuration_hint: provider.reason,
        privacy_level: provider.privacyLevel,
        reports_ttft: provider.reports.ttft,
        reports_output_tokens: provider.reports.outputTokens,
        official_source: provider.officialSource,
        in_catalog: row !== undefined,
      };
    });

    // Deliberately NOT recorded on every read. The dashboard calls this on
    // mount, and a log full of "read the provider list" would bury the four
    // lines somebody actually exported it for. Only the states that explain a
    // later failure are written: a provider that cannot run, or a catalogue
    // that could not be read.
    if (warnings.length > 0 || !databaseAvailable) {
      log?.record('warn', 'config', 'Provider configuration is incomplete', {
        database_available: databaseAvailable,
        // Warnings name which environment variable is missing, never its
        // value - and `redact` would strip it by key name regardless.
        configuration_warnings: warnings,
        unconfigured: availability
          .filter((provider) => !provider.isConfigured)
          .map((provider) => ({
            name: provider.name,
            reason: provider.reason,
          })),
      });
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        database_available: databaseAvailable,
        configuration_warnings: warnings,
        message: databaseAvailable
          ? undefined
          : 'The provider catalog could not be read, so provider_id is null. ' +
            'Run `npm run db:seed` once the database is reachable.',
      },
    });
  } catch (error) {
    console.error('Get providers error:', error);

    log?.record('error', 'config', 'Provider list could not be built', {
      message: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
