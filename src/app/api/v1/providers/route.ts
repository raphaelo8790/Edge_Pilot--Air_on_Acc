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

export const dynamic = 'force-dynamic';

interface ProviderRow {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  isActive: boolean;
}

export async function GET() {
  try {
    const availability = benchmarkRegistry().availability();
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

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
