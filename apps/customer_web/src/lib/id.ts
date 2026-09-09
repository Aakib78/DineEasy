/**
 * Moved to `packages/shared_types/src/id.ts` once `apps/pos_web` needed the exact same
 * client-generated-id fix for its own in-memory cart — see that file's doc comment for the
 * full secure-context backstory. Re-exported here so every existing import of `lib/id.ts` in
 * this app keeps working unchanged.
 */
export { generateId } from '@dineeasy/shared-types';
