import { toolRegistry } from './registry';

import type { ToolDefinition } from '@corpus/core/types';

export function toToolDefinitions(): ToolDefinition[] {
    return toolRegistry.listModelVisible().map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        parameters: cleanSchema(tool.inputSchema),
    }));
}

function cleanSchema(schema: unknown): Record<string, unknown> {
    const params = { ...(schema as Record<string, unknown> | undefined) };
    delete params.$schema;

    return { type: 'object', ...params };
}
