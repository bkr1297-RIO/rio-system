/**
 * OpenAPI SPG-M Contract Tests
 *
 * Verifies public API docs expose optional SPG-M review metadata for governance.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOpenApiSpec } from "../routes/openapi.mjs";

describe("OpenAPI SPG-M govern metadata", () => {
  it("documents optional SPG-M review metadata on API v1 govern", () => {
    const spec = getOpenApiSpec();
    const govern = spec.paths["/api/v1/intents/{intent_id}/govern"].post;

    assert.equal(govern.requestBody.required, false);
    assert.equal(
      govern.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/SpgmGovernRequest"
    );
    assert.ok(govern.description.includes("SPG-M"));
    assert.ok(govern.requestBody.content["application/json"].examples.spgm_review);
  });

  it("defines SPG-M govern request schema aliases", () => {
    const spec = getOpenApiSpec();
    const schema = spec.components.schemas.SpgmGovernRequest;

    assert.ok(schema.properties.spgmPolicyReview);
    assert.ok(schema.properties.spgm_policy_review);
    assert.ok(schema.properties.policy_review);
    assert.ok(schema.properties.spgm.properties.policy_review);
  });

  it("defines SPG-M review metadata as non-executing context", () => {
    const spec = getOpenApiSpec();
    const schema = spec.components.schemas.SpgmPolicyReviewMetadata;

    assert.equal(schema.properties.context_type.enum[0], "spgm_policy_review_metadata");
    assert.equal(schema.properties.mode.enum[0], "non_executing");
    assert.ok(schema.description.includes("cannot authorize"));
  });

  it("documents SPG-M response fields on governance result", () => {
    const spec = getOpenApiSpec();
    const schema = spec.components.schemas.GovernanceResult;

    assert.ok(schema.properties.spgm_policy_context_status);
    assert.ok(schema.properties.spgm_policy_review_applied);
  });
});
