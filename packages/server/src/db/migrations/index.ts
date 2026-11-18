import type { DatabaseSync } from 'node:sqlite';

import { migration as init } from './001-init';
import { migration as pluginSettings } from './002-plugin-settings';
import { migration as logs } from './003-logs';
import { migration as customMcp } from './004-custom-mcp';
import { migration as documents } from './005-documents';
import { migration as documentPaths } from './006-document-paths';
import { migration as documentHash } from './007-document-hash';
import { migration as settings } from './008-settings';
import { migration as messageCitations } from './009-message-citations';
import { migration as logRetrieval } from './010-log-retrieval';
import { migration as messageStopped } from './011-message-stopped';
import { migration as documentDescription } from './012-document-description';

export interface Migration {
    version: number;
    describe: string;
    up(db: DatabaseSync): void;
}

/** 顺序在这里显式写死：不要扫目录，打包成单文件时会丢 */
export const migrations: Migration[] = [
    init,
    pluginSettings,
    logs,
    customMcp,
    documents,
    documentPaths,
    documentHash,
    settings,
    messageCitations,
    logRetrieval,
    messageStopped,
    documentDescription,
];
