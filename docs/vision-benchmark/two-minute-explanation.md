# Two-Minute Explanation

I implemented the Computer Vision Benchmark Module for EdgePilot AI as a
bounded single-label classification benchmark. The workload recognizes seven
construction-safety components: hardhat, safety vest, gloves, goggles, mask,
ladder, and safety cone.

The benchmark starts with a reproducible dataset contract. It includes 21
deterministic synthetic images, three per class. The manifest records the
source, MIT license, labels, privacy review, and a SHA-256 hash for every image.
Before inference, the image processor prevents path traversal, verifies the
hash, checks file size and dimensions, rejects metadata, and converts the image
to a clean PNG.

I added a vision-specific provider interface and real adapters for both local
and cloud execution. The Ollama adapter sends base64 images to the local vision
chat API with deterministic settings. The Gemini adapter sends inline images
to the HTTPS Interactions API and requests a structured label from the same
closed label set.

The evaluator normalizes outputs and calculates accuracy, macro precision,
macro recall, macro F1, per-class metrics, invalid-output rate, request-success
rate, median latency, P95 latency, and throughput. It then applies explicit
quality thresholds and produces a runtime-validated evidence JSON file.

The evidence is mapped into a comparison dashboard that clearly separates
controlled integration results from live provider measurements. The API uses
Zod request validation and requires a server-only bearer token before it can
run a provider.

The final suite has 48 passing test cases covering metrics, schemas, privacy,
hash verification, path security, preprocessing, Ollama, Gemini, evidence
storage, API security, and dashboard integration. This gives the team a
reproducible benchmark foundation without pretending that synthetic fixtures
measure real construction-site accuracy.
