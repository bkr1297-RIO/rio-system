import fs from "node:fs";
import path from "node:path";
import { gitBlobSha, rawSha256 } from "./hash.js";
import { makeSource } from "./refract.js";

export function loadHistoricalFixture(fixturePath, repositoryRoot) {
  const descriptor = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const resolvedSourcePath = path.resolve(repositoryRoot, descriptor.source_path);
  const payload = fs.readFileSync(resolvedSourcePath, "utf8");
  const actualRawSha256 = rawSha256(payload);
  const actualBlobSha = gitBlobSha(payload);

  if (actualRawSha256 !== descriptor.expected_raw_sha256) {
    throw new Error(
      "FIXTURE_CONTENT_HASH_MISMATCH: expected " +
      descriptor.expected_raw_sha256 +
      " received " +
      actualRawSha256
    );
  }
  if (actualBlobSha !== descriptor.source_blob_sha) {
    throw new Error(
      "FIXTURE_BLOB_SHA_MISMATCH: expected " +
      descriptor.source_blob_sha +
      " received " +
      actualBlobSha
    );
  }

  return {
    descriptor,
    source: makeSource({
      source_id: descriptor.source_id,
      object_type: descriptor.object_type,
      source_type: descriptor.source_type,
      payload,
      created_at: descriptor.source_timestamp,
      provenance: {
        ...descriptor.provenance,
        source_path: descriptor.source_path,
        source_blob_sha: descriptor.source_blob_sha,
        raw_sha256: descriptor.expected_raw_sha256
      }
    })
  };
}
