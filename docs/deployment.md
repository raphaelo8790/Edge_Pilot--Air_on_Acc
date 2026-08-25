# EdgePilot AI — Railway Deployment Guide

## Overview

EdgePilot AI is deployed as a single container on Railway with an external PostgreSQL database (Neon).

## Environment Variables

Set these in Railway dashboard:

### Database (Required)
```
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
DIRECT_URL=postgresql://user:password@host:5432/database?sslmode=require
```

### AI Providers (At least one required)
```
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
```

### Authentication
```
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=https://your-app.up.railway.app
```

### Public
```
NEXT_PUBLIC_APP_URL=https://your-app.up.railway.app
```

### Optional
```
BENCHMARK_TIMEOUT_MS=60000
BENCHMARK_FALLBACK_ORDER=ollama,groq,gemini
BENCHMARK_ALLOW_DEMO=false
SENTRY_DSN=your-sentry-dsn
```

## Deployment Steps

1. Push to main branch
2. Railway auto-deploys
3. Run migrations: `npx prisma migrate deploy`
4. Seed providers: `npm run db:seed`

## Health Check

The app includes a health check endpoint:
```
GET /api/v1/providers
```

## Notes

- Ollama is not available on Railway (cloud only)
- Use Gemini and Groq for cloud providers
- Database must be PostgreSQL (Neon recommended)
- All secrets stay server-side (never NEXT_PUBLIC_)
