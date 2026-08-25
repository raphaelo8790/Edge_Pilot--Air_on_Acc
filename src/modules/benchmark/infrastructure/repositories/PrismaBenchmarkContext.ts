/**
 * Prisma implementation of the narrow context lookup the benchmark use case
 * needs: who owns the workload, who owns the device, and what uuid the
 * provider slug maps to.
 *
 * Deliberately three tiny queries with `select` clauses rather than full row
 * fetches — none of the other columns are needed, and the prompt column on a
 * workload can be large.
 */

import type { PrismaClient } from '@prisma/client';
import type { BenchmarkContextGateway } from '../../application/use-cases/RunBenchmark';

export class PrismaBenchmarkContext implements BenchmarkContextGateway {
  constructor(private readonly client: PrismaClient) {}

  public async resolveContext(
    workloadId: string,
    deviceId: string
  ): Promise<{ workloadUserId: string | null; deviceUserId: string | null }> {
    const [workload, device] = await Promise.all([
      this.client.workload.findUnique({
        where: { id: workloadId },
        select: { userId: true },
      }),
      this.client.device.findUnique({
        where: { id: deviceId },
        select: { userId: true },
      }),
    ]);

    return {
      workloadUserId: workload?.userId ?? null,
      deviceUserId: device?.userId ?? null,
    };
  }

  public async resolveProviderId(slug: string): Promise<string | null> {
    const provider = await this.client.provider.findUnique({
      where: { name: slug },
      select: { id: true },
    });

    return provider?.id ?? null;
  }
}
