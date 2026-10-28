# AI Usage Disclosure

## Purpose

This document discloses how AI assistance was used while developing the VECDIM offline-first field-surveillance prototype for the technical assessment. AI assistance was used substantially for planning, implementation support, debugging, test design, and documentation. It is not represented as work completed entirely without AI.

## AI tool used

- **ChatGPT (OpenAI):** used as a coding and development assistant through conversation.

## How AI assistance was used

AI assistance was used to:

- break the assessment requirements into implementation stages and identify the expected mobile, backend, validation, synchronization, and dashboard workflows;
- discuss application structure and implementation approaches for the React Native mobile application, Node.js/Express backend, shared validation package, database integration, and dashboard;
- draft, explain, review, and help revise code and configuration during implementation;
- investigate reported command-line errors, runtime issues, API connectivity problems, validation discrepancies, and integration risks based on the code and logs provided;
- develop validation test cases and assist with interpreting automated test output;
- compare JavaScript validation behaviour with the R validation pipeline, including the handling of missing-value markers such as `NA`, `N/A`, and `NULL`;
- prepare and update developer notes, audit documentation, test records, setup guidance, and this disclosure;
- plan the short demonstration and identify which workflows need to be shown honestly.

AI suggestions were not treated as proof that a feature works. Implementation decisions and fixes were checked against the repository, available test output, and the behaviour observed in the local environment where possible.

## Verification performed

The following checks were run during development, with the results recorded in the project's test documentation:

- `node packages/validation/test-validation.mjs` — **PASS**.
- `node scripts/validation-self-check.mjs` — **PASS**.
- `node scripts/parity-test.mjs "<candidate-pack-path>"` — **PASS** for the tested candidate pack: 1,525 rows aligned; 222 flagged; 1,303 cleaned; zero differing rule cells.
- The R pipeline `R/run_all.R` completed with exit code 0 for the candidate pack used during testing and generated its alert and prediction CSV outputs.
- The generated alert and prediction CSV files were inspected for row counts, tier distributions, and missing required alert fields.

These results apply only to the commands, data, and environment actually tested. They do **not** establish that every component has passed a complete end-to-end test. In particular, a successful R pipeline run is not by itself proof that the mobile app's offline capture, reconnect-and-sync flow, rejected-record correction/resubmission, backend persistence, and dashboard display all work together. Those workflows must be demonstrated and verified separately before being described as end-to-end successful.

## Data and privacy

Any values used solely to exercise forms or validation are dummy test values, not real entomological observations. They must not be described as field findings. No claim is made here that AI generated or verified real field data.

## Developer responsibility and understanding

The developer is responsible for the final submitted implementation, its correctness, security, and limitations. AI-generated suggestions and code must be reviewed, adapted to the project, and understood before submission. The developer should be able to explain the purpose of the submitted code, its main design decisions, how validation and synchronization work, and what the tests do and do not prove.

## Transparency statement

AI assistance contributed to both technical and written work. The disclosure is intended to make that contribution clear rather than minimise it. Test results and feature status should be reported as observed; incomplete or unverified behaviour must be identified explicitly.
