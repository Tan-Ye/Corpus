import { apiUrl, postBinary } from '@/utils/request';

export interface ImportedPackageResult {
    imported: number;
    skipped: { title: string; reason: string }[];
}

export function backupUrl(): string {
    return apiUrl('/backup');
}

/** 导入备份：服务端重新解析入库，重复内容自动跳过 */
export function importBackup(file: File): Promise<ImportedPackageResult> {
    return postBinary<ImportedPackageResult>('/backup', file, {
        contentType: 'application/zip',
        timeout: 300_000,
    });
}
