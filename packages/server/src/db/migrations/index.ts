import type { DatabaseSync } from 'node:sqlite';
import { migration as init } from './001-init';

export interface Migration {
    version: number;
    describe: string;
    up(db: DatabaseSync): void;
}

export const migrations: Migration[] = [init];
