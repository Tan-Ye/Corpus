import type { DatabaseSync } from 'node:sqlite';

import { migration as init } from './001-init';
import { migration as pluginSettings } from './002-plugin-settings';
import { migration as logs } from './003-logs';
import { migration as customMcp } from './004-custom-mcp';

export interface Migration {
    version: number;
    describe: string;
    up(db: DatabaseSync): void;
}

/** 顺序在这里显式写死：不要扫目录，打包成单文件时会丢 */
export const migrations: Migration[] = [init, pluginSettings, logs, customMcp];
