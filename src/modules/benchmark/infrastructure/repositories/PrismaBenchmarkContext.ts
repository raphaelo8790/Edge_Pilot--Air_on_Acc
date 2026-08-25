/**
 * Prisma implementation of the narrow context lookup the benchmark use case
 * needs: who owns the workload, and what uuid the provider slug maps to.
 *
 * Deliberately two tiny queries with `select` clauses rather than full row
 * fetches — none of the other columns are needed, and the prompt column on a
 * workload can be large.
 */

import type { PrismaClient } from '@prisma/client';
import type { BenchmarkContextGateway } from '../../application/use-cases/RunBenchmark';

export class PrismaBenchmarkContext implements BenchmarkContextGateway {
  constructor(private readonly client: PrismaClient) {}

  public async resolveContext(
    workloadId: string
  ): Promise<{ workloadUserId: string | null }> {
    const workload = await this.client.workload.findUnique({
      where: { id: workloadId },
      select: { userId: true },
    });

    return { workloadUserId: workload?.userId ?? null };
  }

  public async resolveProviderId(slug: string): Promise<string | null> {
    const provider = await this.client.provider.findUnique({
      where: { name: slug },
      select: { id: true },
    });

    return provider?.id ?? null;
  }
}
