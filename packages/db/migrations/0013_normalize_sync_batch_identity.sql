-- Prior batch hashes included baseCursor, even though it changes as preceding
-- outbox rows are acknowledged. Authoritative order version and payload hashes
-- make replay safe; remove only the obsolete idempotency cache so clients can
-- repopulate it using the cursor-independent identity.
DELETE FROM sync_batches;
