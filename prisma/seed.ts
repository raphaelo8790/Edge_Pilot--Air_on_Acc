/**
 * Database Seed Script
 * 
 * Seeds the database with initial data for EdgePilot AI.
 * 
 * @module prisma/seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Providers
  const providers = [
    {
      name: 'ollama',
      type: 'local',
      baseUrl: 'http://localhost:11434',
      isActive: true,
    },
    {
      name: 'gemini',
      type: 'cloud',
      baseUrl: null,
      isActive: true,
    },
    {
      name: 'groq',
      type: 'cloud',
      baseUrl: null,
      isActive: true,
    },
  ];

  for (const provider of providers) {
    await prisma.provider.upsert({
      where: { name: provider.name },
      update: provider,
      create: provider,
    });
    console.log(`✅ Provider: ${provider.name}`);
  }

  // Seed Device Profiles
  const devices = [
    { name: 'Raspberry Pi 4', cpu: 'ARM Cortex-A72', ramGb: 4, storageGb: 32, network: 'WiFi' },
    { name: 'Raspberry Pi 5', cpu: 'ARM Cortex-A76', ramGb: 8, storageGb: 64, network: 'WiFi' },
    { name: 'MacBook Air M1', cpu: 'Apple M1', ramGb: 8, storageGb: 256, network: 'WiFi' },
    { name: 'MacBook Pro M2', cpu: 'Apple M2', ramGb: 16, storageGb: 512, network: 'WiFi' },
    { name: 'Gaming PC', cpu: 'Intel i7-12700K', ramGb: 32, storageGb: 1000, gpu: 'RTX 3070', network: 'Ethernet' },
    { name: 'Cloud VM Basic', cpu: '2 vCPU', ramGb: 4, storageGb: 50, network: 'Cloud' },
    { name: 'Cloud VM GPU', cpu: '4 vCPU', ramGb: 16, storageGb: 100, gpu: 'T4', network: 'Cloud' },
    { name: 'Cloud VM High', cpu: '8 vCPU', ramGb: 32, storageGb: 200, gpu: 'A100', network: 'Cloud' },
  ];

  // Create a default user for seeding
  const defaultUser = await prisma.user.upsert({
    where: { email: 'demo@edgepilot.ai' },
    update: {},
    create: {
      email: 'demo@edgepilot.ai',
      name: 'Demo User',
    },
  });

  for (const device of devices) {
    await prisma.device.create({
      data: {
        ...device,
        userId: defaultUser.id,
      },
    });
    console.log(`✅ Device: ${device.name}`);
  }

  // Seed Workloads
  const workloads = [
    {
      taskType: 'text_generation',
      inputFormat: 'plain text prompt',
      outputFormat: 'plain text answer',
      constraints: { maxTokens: 1000 },
    },
    {
      taskType: 'code_generation',
      inputFormat: 'natural language description',
      outputFormat: 'TypeScript code',
      constraints: { language: 'typescript' },
    },
    {
      taskType: 'image_recognition',
      inputFormat: 'image URL or base64',
      outputFormat: 'JSON with labels and confidence',
      constraints: { maxFileSize: '5MB' },
    },
    {
      taskType: 'multimodal',
      inputFormat: 'text + image',
      outputFormat: 'text response',
      constraints: {},
    },
  ];

  for (const workload of workloads) {
    await prisma.workload.create({
      data: {
        ...workload,
        userId: defaultUser.id,
      },
    });
    console.log(`✅ Workload: ${workload.taskType}`);
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
