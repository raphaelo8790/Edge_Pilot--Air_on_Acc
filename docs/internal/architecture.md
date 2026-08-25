# Architecture Guide

## 📋 Table of Contents

- [Architecture Choice](#architecture-choice)
- [Why Hexagonal?](#why-hexagonal)
- [Core Principles](#core-principles)
- [Module Structure](#module-structure)
- [Data Flow](#data-flow)
- [Security Boundaries](#security-boundaries)
- [Database Schema](#database-schema)

---

## 🏛️ Architecture Choice

**Chosen:** Hexagonal Architecture (Ports and Adapters)

**Why?**
1. ✅ **Multiple Consumers:** Web UI, CLI, API, Tests
2. ✅ **Multiple Providers:** Ollama, Gemini, Groq, OpenAI
3. ✅ **Highly Testable:** Business logic testable without UI
4. ✅ **Clean Boundaries:** Clear separation of concerns
5. ✅ **Flexibility:** Easy to swap implementations

---

## 🔷 Why Hexagonal?

### Problem with Traditional Architecture

```
UI → Business Logic → Database
     (tightly coupled)
```

- Hard to test business logic
- Hard to swap database
- Hard to add new UI

### Hexagonal Solution

```
UI → Ports → Domain → Ports → Database
         (interfaces)
```

- Business logic independent of UI
- Database independent of business logic
- Easy to test, easy to swap

---

## 🎯 Core Principles

### 1. Dependency Inversion

```
Infrastructure → Application → Domain
(Adapters)     (Use Cases)   (Entities)
```

- Domain has NO dependencies on infrastructure
- Business rules are pure TypeScript
- Framework agnostic

### 2. Ports and Adapters

**Ports:** Interfaces (what the system needs)
```typescript
// Port: What the system needs
interface AIProvider {
  generate(prompt: string): Promise<AIResponse>;
  benchmark(prompt: string, iterations: number): Promise<BenchmarkResult>;
}
```

**Adapters:** Implementations (how it's done)
```typescript
// Adapter: How it's done
class OllamaProvider implements AIProvider {
  async generate(prompt: string): Promise<AIResponse> {
    // Call Ollama API
  }
}
```

### 3. Domain Independence

- Domain has NO dependencies on infrastructure
- Business rules are pure TypeScript
- Framework agnostic

---

## 📁 Module Structure

### Example: Benchmark Module

```
src/modules/benchmark/
├── core/                    # Domain & Ports
│   ├── entities/            # Business objects
│   │   ├── Benchmark.ts
│   │   ├── BenchmarkResult.ts
│   │   └── index.ts
│   ├── ports/               # Interfaces
│   │   ├── AIProvider.ts
│   │   ├── BenchmarkRepository.ts
│   │   └── index.ts
│   └── services/            # Business logic
│       ├── ReadinessCalculator.ts
│       ├── ComparisonEngine.ts
│       └── index.ts
├── application/             # Use Cases
│   ├── use-cases/
│   │   ├── RunBenchmark.ts
│   │   ├── CompareProviders.ts
│   │   ├── CalculateReadiness.ts
│   │   └── index.ts
│   ├── dtos/
│   │   ├── BenchmarkRequest.ts
│   │   ├── BenchmarkResponse.ts
│   │   └── index.ts
│   └── index.ts
└── infrastructure/          # Adapters
    ├── repositories/
    │   ├── PrismaBenchmarkRepository.ts
    │   └── index.ts
    ├── providers/
    │   ├── OllamaProvider.ts
    │   ├── GeminiProvider.ts
    │   ├── GroqProvider.ts
    │   └── index.ts
    └── index.ts
```

### Layer Responsibilities

**Core (Domain):**
- Entities (business objects)
- Ports (interfaces)
- Services (business logic)
- **NO dependencies on infrastructure**

**Application (Use Cases):**
- Use cases (orchestrate ports)
- DTOs (data transfer objects)
- **Depends on Core only**

**Infrastructure (Adapters):**
- Repositories (database)
- Providers (external APIs)
- **Implements ports from Core**

---

## 📊 Data Flow

### Benchmark Flow

```
1. User fills form (Workload + Device + Provider)
   ↓
2. Client validates with Zod (UX)
   ↓
3. Client sends POST to /api/v1/benchmark
   ↓
4. API route validates with Zod (security)
   ↓
5. API route checks rate limit
   ↓
6. API route authenticates user
   ↓
7. RunBenchmark use case executes
   ↓
8. ProviderAdapter calls external API (server-side)
   ↓
9. Result stored in database
   ↓
10. Response returned to client
   ↓
11. Client displays results
```

### Security Boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                       │
│  - No API keys                                           │
│  - Zod validation (UX only)                              │
│  - Displays sanitized data                               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   API ROUTES (Server)                     │
│  - API keys accessible                                   │
│  - Zod validation (security)                             │
│  - Rate limiting                                         │
│  - Authentication                                        │
│  - Calls use cases                                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   USE CASES (Application)                 │
│  - Business logic                                        │
│  - Orchestrates ports                                    │
│  - No framework dependencies                             │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   ADAPTERS (Infrastructure)               │
│  - Database (Prisma)                                     │
│  - External APIs (Ollama, Gemini, Groq)                  │
│  - File system                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🔒 Security Boundaries

### 1. API Key Management

**Rule:** API keys MUST NEVER reach the client

```typescript
// ❌ WRONG - Keys exposed to client
const apiKey = process.env.NEXT_PUBLIC_API_KEY; // BAD!

// ✅ CORRECT - Keys stay server-side
const apiKey = process.env.OLLAMA_API_KEY; // GOOD!
```

### 2. Environment Variables

```bash
# .env.local (NEVER committed)

# Database
DATABASE_URL="postgresql://..."

# AI Providers (SERVER-ONLY)
OLLAMA_HOST="http://localhost:11434"
GEMINI_API_KEY="..."
GROQ_API_KEY="..."

# Public (safe to expose)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Input Validation

**Use Zod for all inputs:**

```typescript
import { z } from 'zod';

const BenchmarkRequestSchema = z.object({
  workload_id: z.string().uuid(),
  device_id: z.string().uuid(),
  provider: z.enum(['ollama', 'gemini', 'groq']),
  model: z.string().min(1),
  prompt: z.string().min(1).max(10000),
  iterations: z.number().int().min(1).max(100),
});
```

---

## 🗄️ Database Schema

### Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workloads  Workload[]
  devices    Device[]
  benchmarks Benchmark[]
}

model Workload {
  id           String   @id @default(uuid())
  taskType     String   @map("task_type")
  inputFormat  String   @map("input_format")
  outputFormat String   @map("output_format")
  constraints  Json     @default("{}")
  userId       String   @map("user_id")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user       User        @relation(fields: [userId], references: [id])
  benchmarks Benchmark[]

  @@map("workloads")
}

model Device {
  id        String   @id @default(uuid())
  name      String
  cpu       String
  ramGb     Int      @map("ram_gb")
  gpu       String?
  storageGb Int      @map("storage_gb")
  network   String?
  userId    String   @map("user_id")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user       User        @relation(fields: [userId], references: [id])
  benchmarks Benchmark[]

  @@map("devices")
}

model Benchmark {
  id             String   @id @default(uuid())
  workloadId     String   @map("workload_id")
  deviceId       String   @map("device_id")
  providerId     String   @map("provider_id")
  model          String
  prompt         String
  iterations     Int      @default(1)
  status         String   @default("pending")
  userId         String   @map("user_id")
  createdAt      DateTime @default(now())
  completedAt    DateTime? @map("completed_at")

  workload   Workload         @relation(fields: [workloadId], references: [id])
  device     Device           @relation(fields: [deviceId], references: [id])
  provider   Provider         @relation(fields: [providerId], references: [id])
  user       User             @relation(fields: [userId], references: [id])
  results    BenchmarkResult[]
  readiness  ReadinessScore?

  @@map("benchmarks")
}

model BenchmarkResult {
  id              String   @id @default(uuid())
  benchmarkId     String   @map("benchmark_id")
  iteration       Int
  latencyMs       Float    @map("latency_ms")
  tokensPerSecond Float?   @map("tokens_per_second")
  ttftMs          Float?   @map("ttft_ms")
  success         Boolean  @default(true)
  errorMessage    String?  @map("error_message")
  createdAt       DateTime @default(now())

  benchmark Benchmark @relation(fields: [benchmarkId], references: [id])

  @@map("benchmark_results")
}

model ReadinessScore {
  id              String   @id @default(uuid())
  benchmarkId     String   @unique @map("benchmark_id")
  hardwareFit     Int      @map("hardware_fit")
  latencyScore    Int      @map("latency_score")
  privacyScore    Int      @map("privacy_score")
  costScore       Int      @map("cost_score")
  reliabilityScore Int     @map("reliability_score")
  overallReadiness Int     @map("overall_readiness")
  recommendation  String
  evidence        Json     @default("[]")
  limitations     Json     @default("[]")
  createdAt       DateTime @default(now())

  benchmark Benchmark @relation(fields: [benchmarkId], references: [id])

  @@map("readiness_scores")
}
```

---

## 📚 References

- [Hexagonal Architecture in Next.js](https://matias-suez.com/blog/hexagonal-architecture-nextjs)
- [Clean Architecture with Next.js](https://medium.com/@srachel27/from-pages-to-boundaries-a-practical-clean-architecture-for-next-js-16-9696bcd98005)
- [Next.js Security Best Practices](https://makerkit.dev/blog/tutorials/nextjs-security)

---

**Last Updated:** July 21, 2026
