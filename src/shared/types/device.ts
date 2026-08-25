import { z } from 'zod';

// Device Schema
export const DeviceSchema = z.object({
  device_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  cpu: z.string().min(1),
  ram_gb: z.number().int().min(1),
  gpu: z.string().nullable(),
  storage_gb: z.number().int().min(1),
  network: z.string().nullable(),
});

export type Device = z.infer<typeof DeviceSchema>;

// Create Device Request
export const CreateDeviceSchema = DeviceSchema.omit({ device_id: true });
export type CreateDeviceRequest = z.infer<typeof CreateDeviceSchema>;
