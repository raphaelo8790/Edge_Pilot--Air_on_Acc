# Vision Benchmark Test Cases

The automated suite contains 48 documented cases.

| ID | Area | Scenario |
|---|---|---|
| VB-001 | Normalization | Direct supported label |
| VB-002 | Normalization | Spaces and casing |
| VB-003 | Normalization | Quoted hard-hat alias |
| VB-004 | Normalization | Hyphenated label |
| VB-005 | Normalization | Explanatory output |
| VB-006 | Normalization | Unsupported output |
| VB-007 | Manifest | Valid ready manifest |
| VB-008 | Manifest | Unsupported label |
| VB-009 | Manifest | Duplicate sample ID |
| VB-010 | Manifest | Unverified license |
| VB-011 | Metrics | Perfect predictions |
| VB-012 | Metrics | No correct prediction |
| VB-013 | Metrics | Even-count median |
| VB-014 | Metrics | Nearest-rank P95 |
| VB-015 | Metrics | Invalid successful output |
| VB-016 | Metrics | Provider failure |
| VB-017 | Evaluator | Passing evidence |
| VB-018 | Evaluator | Deterministic evidence |
| VB-019 | Evaluator | Response-count mismatch |
| VB-020 | Evaluator | Missing privacy review |
| VB-021 | Evaluator | Invalid explanatory output |
| VB-022 | Evaluator | Provider error classification |
| VB-023 | Execution | Local provider boundary |
| VB-024 | Execution | Cloud provider boundary |
| VB-025 | Execution | Sequential sample ordering |
| VB-026 | Execution | Thrown provider error |
| VB-027 | Execution | Empty prompt rejection |
| VB-028 | Dataset | Ready licensed privacy-reviewed manifest |
| VB-029 | Dataset | Three samples for every label |
| VB-030 | Preprocessing | Valid generated PNG |
| VB-031 | Preprocessing | SHA-256 mismatch rejection |
| VB-032 | Security | Repository path traversal rejection |
| VB-033 | Request schema | Complete run request |
| VB-034 | Request schema | Unsupported provider rejection |
| VB-035 | Evidence schema | Committed controlled evidence |
| VB-036 | Dashboard | Evidence-to-row mapping |
| VB-037 | Dashboard | Deterministic row ranking |
| VB-038 | Evidence store | Validated round trip |
| VB-039 | Evidence store | Unsafe filename rejection |
| VB-040 | Ollama adapter | Local image chat request |
| VB-041 | Ollama adapter | HTTP error normalization |
| VB-042 | Gemini adapter | Cloud inline-image request |
| VB-043 | Gemini adapter | Malformed structured output |
| VB-044 | Gemini adapter | Missing API key |
| VB-045 | Gemini adapter | API error normalization |
| VB-046 | API integration | Dashboard evidence response |
| VB-047 | API security | Execution disabled without token |
| VB-048 | API security | Invalid bearer token |

Run all cases:

```bash
npm test -- --runInBand
```
