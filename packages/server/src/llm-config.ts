import type { DatabaseSync } from 'node:sqlite';

import { getLLMModel, initLLMConfig, isLLMConfigured } from '@corpus/core';

import { db as defaultDb } from './db';
import env from './env';
import { getSetting, setSetting } from './repository/settings';

/** 给前端的模型配置视图：永远不回显 apiKey，只告诉前端有没有 */
export interface LLMConfigView {
    /** 能不能发消息 */
    configured: boolean;
    /** user = 界面里填的；env = 开发环境的 .env；none = 都没有 */
    source: 'user' | 'env' | 'none';
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
}

export interface LLMConfigInput {
    baseUrl: string;
    model: string;
    /** 留空表示沿用已保存的 key（改地址 / 模型时不用重填） */
    apiKey?: string;
}

const KEY_BASE_URL = 'llm.baseUrl';
const KEY_MODEL = 'llm.model';
const KEY_API_KEY = 'llm.apiKey';

interface StoredConfig {
    baseUrl: string;
    model: string;
    apiKey: string;
}

function readStored(db: DatabaseSync): StoredConfig | null {
    const baseUrl = getSetting(KEY_BASE_URL, db) ?? '';
    const model = getSetting(KEY_MODEL, db) ?? '';

    if (!baseUrl || !model) {
        return null;
    }

    return { baseUrl, model, apiKey: getSetting(KEY_API_KEY, db) ?? '' };
}

/** 开发环境的兜底：.env（生产环境 env.ts 根本不会读它） */
function readEnv(): StoredConfig | null {
    if (!env.LLM_BASE_URL || !env.LLM_MODEL || !env.LLM_API_KEY) {
        return null;
    }

    return {
        baseUrl: env.LLM_BASE_URL,
        model: env.LLM_MODEL,
        apiKey: env.LLM_API_KEY,
    };
}

function view(source: LLMConfigView['source'], config: StoredConfig | null): LLMConfigView {
    return {
        configured: isLLMConfigured(),
        source,
        baseUrl: config?.baseUrl ?? '',
        model: config?.model ?? getLLMModel() ?? '',
        hasApiKey: Boolean(config?.apiKey),
    };
}

/**
 * 只读当前状态，不重新初始化客户端。给 GET 接口用：
 * 读配置不该有副作用，也不该在配置坏掉时把接口打挂。
 */
export function currentLLMConfig(db: DatabaseSync = defaultDb): LLMConfigView {
    const stored = readStored(db);

    if (stored && stored.apiKey) {
        return view('user', stored);
    }

    const fromEnv = readEnv();

    if (fromEnv) {
        return view('env', fromEnv);
    }

    return view('none', stored);
}

/**
 * 启动时加载模型配置：界面里填的优先，其次开发环境的 .env。
 *
 * 都没有也不抛错——服务照常启动，只是 /chat 会拒绝。
 * 否则「没有配置」和「配置错了」都表现为服务起不来，用户也就没地方去填。
 */
export function loadLLMConfig(db: DatabaseSync = defaultDb): LLMConfigView {
    const stored = readStored(db);

    if (stored && stored.apiKey) {
        initLLMConfig(stored);
        return view('user', stored);
    }

    const fromEnv = readEnv();

    if (fromEnv) {
        initLLMConfig(fromEnv);
        return view('env', fromEnv);
    }

    return view('none', stored);
}

/** 保存并立即生效：不用重启服务 */
export function saveLLMConfig(
    input: LLMConfigInput,
    db: DatabaseSync = defaultDb,
): LLMConfigView {
    const baseUrl = input.baseUrl.trim();
    const model = input.model.trim();
    const apiKey = input.apiKey?.trim() || (getSetting(KEY_API_KEY, db) ?? '');

    if (!baseUrl || !model) {
        throw new Error('服务地址和模型名都要填');
    }

    if (!/^https?:\/\//i.test(baseUrl)) {
        throw new Error('服务地址要以 http:// 或 https:// 开头');
    }

    if (!apiKey) {
        throw new Error('API Key 要填');
    }

    setSetting(KEY_BASE_URL, baseUrl, db);
    setSetting(KEY_MODEL, model, db);
    setSetting(KEY_API_KEY, apiKey, db);

    initLLMConfig({ baseUrl, model, apiKey });

    return view('user', { baseUrl, model, apiKey });
}
