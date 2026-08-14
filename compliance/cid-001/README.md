# CID-001 Conformance

Offline, deterministic conformance harness for the candidate Constitutional Intelligence Doctrine.

## Run

From this directory:

    npm test
    npm run conform

The suite executes ten fixtures, one for each `CT-CI-01` through `CT-CI-10` requirement. It also smoke-tests existing RIO, Sentinel, Prime authorization, and MUS receipt seams.

## Claim boundary

A passing run establishes that the fixtures satisfy CID-001 under this declared offline evaluator and that mapped runtime seams exhibit the checked boundary behaviors. It does not certify a live deployment, prove every production path, modify policy, authorize an action, or establish legal compliance.

## Structure

    cid-001-conformance.json  machine-readable manifest and runtime map
    fixtures/                 ten hostile and positive specimens
    src/evaluator.mjs         side-effect-free doctrine evaluator
    src/run.mjs               JSON report runner
    tests/cid-001.test.mjs    fixture and existing-runtime anchor tests
