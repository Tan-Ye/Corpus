import type { DatabaseSync } from 'node:sqlite';

import { createRetrievalSchema } from '../../retrieval/schema';

export const migration = {
    version: 5,
    describe: 'documents + chunks + chunks_fts',
    up(db: DatabaseSync) {
        createRetrievalSchema(db);
    },
};
