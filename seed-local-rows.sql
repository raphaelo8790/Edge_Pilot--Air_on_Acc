-- Local sandbox only. Creates the one user + one workload + one device that
-- POST /api/v1/workloads and POST /api/v1/devices are supposed to create but
-- do not (both are hardcoded scaffolds that never call Prisma).
-- Safe to re-run: every statement is ON CONFLICT DO NOTHING.

INSERT INTO users (id, email, name, "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001',
        'adham@local.test',
        'Adham (local sandbox)',
        NOW())
ON CONFLICT (email) DO NOTHING;

INSERT INTO workloads (id, task_type, input_format, output_format, constraints, user_id, "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000002',
        'text-generation',
        'plain text prompt',
        'plain text answer',
        '{}',
        '00000000-0000-4000-8000-000000000001',
        NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO devices (id, name, cpu, ram_gb, gpu, storage_gb, network, user_id, "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000003',
        'LoQ Windows workstation',
        'unspecified',
        16,
        'unspecified',
        512,
        'local',
        '00000000-0000-4000-8000-000000000001',
        NOW())
ON CONFLICT (id) DO NOTHING;

SELECT 'workload' AS kind, id FROM workloads
UNION ALL
SELECT 'device', id FROM devices;
