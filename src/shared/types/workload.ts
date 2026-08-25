import { z } from 'zod';

// Workload Schema
export const WorkloadSchema = z.object({
  workload_id: z.string().uuid(),
  task_type: z.enum(['text_generation', 'code_generation', 'image_recognition', 'multimodal']),
  input_format: z.string().min(1),
  output_format: z.string().min(1),
  constraints: z.record(z.unknown()),
});

export type Workload = z.infer<typeof WorkloadSchema>;

// Create Workload Request
export const CreateWorkloadSchema = WorkloadSchema.omit({ workload_id: true });
export type CreateWorkloadRequest = z.infer<typeof CreateWorkloadSchema>;
