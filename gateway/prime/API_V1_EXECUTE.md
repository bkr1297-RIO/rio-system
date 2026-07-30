# Prime API v1 Execute

Authenticated endpoint:

```text
POST /api/v1/prime/execute
```

Required gateway conditions:

- valid JWT owner or API key with `write` scope;
- resolved active principal with the `executor` role;
- Prime Relational IR;
- explicit, unexpired authorization scoped to `prime.echo`.

Request:

```json
{
  "ir": {
    "source_expression": "7 -> 8 -> 7",
    "lexicon_version": "prime-experimental-v0.1",
    "symbols": ["7", "8", "7"],
    "transitions": [
      {"origin": "7", "destination": "8", "direction": "OUTWARD_TO_BOUNDARY"},
      {"origin": "8", "destination": "7", "direction": "INWARD_FROM_BOUNDARY"}
    ],
    "closed_path": true
  },
  "authorization": {
    "decision": "approved",
    "action": "prime.echo",
    "authorized_by": "human-root",
    "expires_at": "<future ISO-8601 timestamp>"
  }
}
```

Successful response includes:

- Prime-readable returned expression;
- runtime intent, governance, authorization, and execution records;
- native RIO five-hash receipt;
- receipt verification result;
- authenticated principal identity.

Current operation boundary:

```text
prime.echo
```

It has no external side effects. This endpoint proves authenticated transport into the active gateway before a reversible tool connector is introduced.
