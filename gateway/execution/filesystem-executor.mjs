import {
  constants,
  mkdirSync,
  openSync,
  closeSync,
  writeFileSync,
  fsyncSync,
  readFileSync,
  lstatSync,
  fstatSync,
  realpathSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export function validateArtifactOperation(operation) {
  if (
    operation.action !== 'create_document' ||
    typeof operation.target !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(operation.target)
  )
    throw new Error('TARGET_OR_ACTION_INVALID');
  if (
    !operation.payload ||
    typeof operation.payload.content !== 'string' ||
    Object.keys(operation.payload).join(',') !== 'content' ||
    Buffer.byteLength(operation.payload.content, 'utf8') > 4096
  )
    throw new Error('PAYLOAD_INVALID');
}

/** Linux descriptor-bound, create-only adapter. Only the supplied gate can release it. */
export function createFilesystemExecutor({ root, guard }) {
  if (process.platform !== 'linux')
    throw new Error('FILESYSTEM_PROFILE_REQUIRES_LINUX');
  if (typeof guard !== 'function') throw new Error('FIDELITY_GUARD_REQUIRED');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink())
    throw new Error('ARTIFACT_ROOT_SYMLINK');
  const rootPath = realpathSync(resolve(root));
  const dir = openSync(
    rootPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  return {
    execute(operation, permit) {
      validateArtifactOperation(operation);
      guard(operation, permit);
      let fd;
      try {
        fd = openSync(
          `/proc/self/fd/${dir}/${operation.target}`,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        writeFileSync(fd, operation.payload.content, 'utf8');
        fsyncSync(fd);
        fsyncSync(dir);
        return {
          status: 'COMPLETED',
          invocation_id: randomUUID(),
          bytes: Buffer.byteLength(operation.payload.content, 'utf8'),
        };
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    },
    observe(operation) {
      const path = `/proc/self/fd/${dir}/${operation.target}`;
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > 4096)
          throw new Error('OBSERVATION_RESOURCE_INVALID');
        const bytes = readFileSync(fd),
          expected = Buffer.from(operation.payload.content, 'utf8');
        return {
          occurrence_id: randomUUID(),
          status: bytes.equals(expected) ? 'OBSERVED' : 'MISMATCH',
          target: operation.target,
          content_hash: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
          device: stat.dev,
          inode: stat.ino,
          observed_at: new Date().toISOString(),
          method: 'separate_descriptor_read_after_write',
        };
      } finally {
        closeSync(fd);
      }
    },
    close() {
      closeSync(dir);
    },
  };
}
