#!/bin/bash
# Run only unit tests (not integration tests that require API key)
npx vitest run --reporter=verbose src/config.test.ts src/openrouter.unit.test.ts src/config.integration.test.ts