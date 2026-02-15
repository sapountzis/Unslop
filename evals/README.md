# Evals

This directory tracks evaluation definitions and outputs for Unslop behavior over time.

## Functional eval categories
- API classification decision correctness and schema conformance.
- Extension decision application behavior (hide/keep flows).
- Auth, subscription, and quota enforcement paths.
- Regression checks for platform extraction/parsing across LinkedIn, X/Twitter, and Reddit.

## Behavioral eval categories
- Consistency of model decisions for equivalent post inputs.
- Stability under minor text variations and noisy formatting.
- Safety/policy adherence for allowed product scope and constraints.
- False-positive/false-negative trend snapshots on curated fixtures.

## Notes
- Evals are intentionally not wired into `make check` yet.
- Add runnable eval harnesses incrementally and document ownership per eval suite.
