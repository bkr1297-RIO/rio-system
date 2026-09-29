import { canonicalizeArgs, computeArgsHash } from './token-manager.mjs';
import { verifySignature } from './ed25519.mjs';
import {
  VALID_ACTOR_TYPES,
  VALID_ROLES,
  PROHIBITED_ROLE_COMBINATIONS,
} from './principals.mjs';

export const hash = computeArgsHash;
export function requireValue(ok, code) {
  if (!ok) throw new Error(code);
}
export function fresh(body, now = Date.now()) {
  const issued = Date.parse(body.issued_at),
    expires = Date.parse(body.expires_at);
  requireValue(
    Number.isFinite(issued) &&
      Number.isFinite(expires) &&
      issued <= now &&
      expires > now &&
      expires > issued,
    'EXPIRED_OR_INVALID_TIME',
  );
}
export function verifySigned(record, publicKey) {
  requireValue(
    record &&
      typeof record === 'object' &&
      record.body &&
      typeof record.signature === 'string',
    'SIGNATURE_REQUIRED',
  );
  requireValue(
    verifySignature(canonicalizeArgs(record.body), record.signature, publicKey),
    'SIGNATURE_INVALID',
  );
}
export function validateNode(node) {
  requireValue(
    node &&
      typeof node.node_id === 'string' &&
      /^[a-zA-Z0-9._:-]{1,128}$/.test(node.node_id) &&
      node.principal_id === node.node_id,
    'NODE_ID_INVALID',
  );
  requireValue(
    [
      'laptop',
      'mobile',
      'local_service',
      'cloud_service',
      'model_runtime',
      'agent_runtime',
      'storage_service',
      'device',
    ].includes(node.node_type),
    'NODE_TYPE_INVALID',
  );
  requireValue(
    VALID_ACTOR_TYPES.includes(node.actor_type) &&
      VALID_ROLES.includes(node.primary_role),
    'PRINCIPAL_ROLE_INVALID',
  );
  requireValue(
    Array.isArray(node.secondary_roles) &&
      node.secondary_roles.every((r) => VALID_ROLES.includes(r)),
    'PRINCIPAL_ROLE_INVALID',
  );
  const roles = [node.primary_role, ...node.secondary_roles];
  requireValue(
    !roles.includes('root_authority') && !roles.includes('approver'),
    'ENROLLMENT_CANNOT_CREATE_AUTHORITY',
  );
  requireValue(
    !PROHIBITED_ROLE_COMBINATIONS.some(
      ([a, b]) => roles.includes(a) && roles.includes(b),
    ),
    'PRINCIPAL_ROLE_COLLAPSE',
  );
  requireValue(/^[0-9a-f]{64}$/.test(node.public_key_hex), 'NODE_KEY_INVALID');
  requireValue(
    node.status === 'active' &&
      Array.isArray(node.capabilities) &&
      node.capabilities.every((x) => typeof x === 'string') &&
      Array.isArray(node.interfaces) &&
      node.interfaces.length > 0 &&
      typeof node.custody_boundary === 'string' &&
      node.custody_boundary.length > 0,
    'NODE_BOUNDARY_INVALID',
  );
}
export function nodeAt(store, id) {
  const entry = store.get('enrollment', id);
  requireValue(entry, 'UNKNOWN_NODE');
  requireValue(!store.state('node_revoked', id), 'NODE_REVOKED');
  return entry.body.node;
}
export function verifyNodeRecord(store, record, fieldId) {
  requireValue(record?.body?.field_id === fieldId, 'FIELD_MISMATCH');
  const node = nodeAt(store, record.body.source_node);
  verifySigned(record, node.public_key_hex);
  fresh(record.body);
  return node;
}
export function resolveGrant(
  store,
  grantId,
  request,
  root,
  fieldId,
  visited = new Set(),
) {
  requireValue(
    !visited.has(grantId) && visited.size < 16,
    'AUTHORITY_LINEAGE_CYCLE',
  );
  visited.add(grantId);
  const signed = store.get('grant', grantId);
  requireValue(signed, 'AUTHORITY_MISSING');
  const b = signed.body,
    g = b.grant;
  requireValue(b.field_id === fieldId, 'AUTHORITY_FIELD_MISMATCH');
  fresh(b);
  requireValue(!store.state('grant_revoked', grantId), 'AUTHORITY_REVOKED');
  requireValue(
    !store.state('grant_superseded', grantId),
    'AUTHORITY_SUPERSEDED',
  );
  requireValue(
    g.max_uses === null || (store.state('uses', grantId) || 0) < g.max_uses,
    'AUTHORITY_SPENT',
  );
  const issuer =
    b.issuer === root.principal_id ? root : nodeAt(store, b.issuer);
  verifySigned(signed, issuer.public_key_hex);
  for (const field of [
    'subject',
    'action',
    'target',
    'target_node',
    'scope',
    'purpose',
  ])
    requireValue(
      g[field] === request[field],
      `AUTHORITY_${field.toUpperCase()}_MISMATCH`,
    );
  requireValue(
    hash(g.conditions) === hash({}) && hash(request.conditions) === hash({}),
    'UNSUPPORTED_CONDITIONS',
  );
  for (const [name, value] of Object.entries(g.dependencies))
    requireValue(
      request.dependencies[name] === value,
      'DEPENDENCY_GRANT_MISMATCH',
    );
  for (const [name, value] of Object.entries(request.dependencies))
    requireValue(
      store.state('dependency', name) === value,
      'DEPENDENCY_CHANGED',
    );
  if (g.payload_hash)
    requireValue(
      g.payload_hash === request.payload_hash,
      'AUTHORITY_PAYLOAD_MISMATCH',
    );
  if (!g.parent) {
    requireValue(b.issuer === root.principal_id, 'AUTHORITY_ROOT_REQUIRED');
    return [signed];
  }
  const parent = store.get('grant', g.parent);
  requireValue(
    parent?.body.grant.allow_delegation === true,
    'DELEGATION_NOT_ALLOWED',
  );
  requireValue(
    b.issuer === parent.body.grant.subject,
    'DELEGATION_ISSUER_MISMATCH',
  );
  requireValue(
    Date.parse(b.expires_at) <= Date.parse(parent.body.expires_at),
    'DELEGATION_EXPIRY_EXPANSION',
  );
  const lineage = resolveGrant(
    store,
    g.parent,
    { ...request, subject: b.issuer },
    root,
    fieldId,
    visited,
  );
  return [...lineage, signed];
}
