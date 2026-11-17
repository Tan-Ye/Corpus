import { db } from '../db';
import type { McpTransportConfig } from '../mcp/client';

export interface CustomMcpRecord {
    id: string;
    name?: string;
    description?: string;
    modelHint?: string;
    tools?: string[];
    transport: McpTransportConfig;
}

interface CustomMcpRow {
    id: string;
    name: string | null;
    description: string | null;
    model_hint: string | null;
    tools: string | null;
    transport: string;
}

function parseJson<T>(value: string | null): T | undefined {
    if (!value) {
        return undefined;
    }

    try {
        return JSON.parse(value) as T;
    } catch {
        return undefined;
    }
}

export function listCustomServers(): CustomMcpRecord[] {
    const rows = db
        .prepare('SELECT * FROM custom_mcp ORDER BY created_at')
        .all() as unknown as CustomMcpRow[];

    return rows.map((row) => ({
        id: row.id,
        name: row.name ?? undefined,
        description: row.description ?? undefined,
        modelHint: row.model_hint ?? undefined,
        tools: parseJson<string[]>(row.tools),
        transport: JSON.parse(row.transport) as McpTransportConfig,
    }));
}

export function saveCustomServer(record: CustomMcpRecord): void {
    db.prepare(
        `INSERT INTO custom_mcp (id, name, description, model_hint, tools, transport, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            model_hint = excluded.model_hint,
            tools = excluded.tools,
            transport = excluded.transport`,
    ).run(
        record.id,
        record.name ?? null,
        record.description ?? null,
        record.modelHint ?? null,
        record.tools ? JSON.stringify(record.tools) : null,
        JSON.stringify(record.transport),
        Date.now(),
    );
}

export function deleteCustomServer(id: string): void {
    db.prepare('DELETE FROM custom_mcp WHERE id = ?').run(id);
}
