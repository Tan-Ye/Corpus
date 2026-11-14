/**
 * HTTP 客户端：原生 fetch。
 *
 * 为什么不用 axios：对话流式必须拿到增量，axios（XHR）拿不到，只能再开一条 fetch 通道；
 * 两套客户端 = 两套超时/错误处理/baseURL。决策记录见 docs/architecture.md §14。
 */

export class ApiError extends Error {
    readonly status?: number;
    readonly data?: unknown;

    constructor(message: string, status?: number, data?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const TIMEOUT = 30_000;

export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** 对象会被 JSON.stringify；字符串原样发 */
    body?: unknown;
    /** 仅普通请求生效；流式请求不设超时 */
    timeout?: number;
    /** 请求头设置 */
    headers?: HeadersInit;
    /** 接受的响应类型 */
    accept?: string;
}

function buildUrl(path: string): string {
    if (!BASE_URL) return path;
    return `${BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function buildInit(options: RequestOptions): RequestInit {
    const headers = new Headers();
    let body: BodyInit | undefined;

    if (options.body !== undefined) {
        if (typeof options.body === 'string') {
            body = options.body;
        } else {
            body = JSON.stringify(options.body);
            headers.set('content-type', 'application/json');
        }
    }

    if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
            headers.set(key, value);
        }
    }

    if (options.accept) {
        headers.set('accept', options.accept);
    }

    return { method: options.method ?? 'GET', headers, body };
}

async function toApiError(response: Response): Promise<ApiError> {
    let data: unknown;
    try {
        data = await response.json();
    } catch {
        data = undefined;
    }
    const body = data as { error?: string; message?: string } | undefined;
    return new ApiError(
        body?.error ?? body?.message ?? `请求失败（${response.status}）`,
        response.status,
        data,
    );
}

/** 普通 JSON 请求，带 30s 超时 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(buildUrl(path), {
            ...buildInit(options),
            signal: AbortSignal.timeout(options.timeout ?? TIMEOUT),
        });
    } catch {
        throw new ApiError('连不上服务端');
    }

    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
}

/** 流式（SSE）：不设超时，返回原始 Response，调用方自己 getReader() 按帧读 */
export async function requestStream(path: string, options: RequestOptions = {}): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(buildUrl(path), buildInit({ ...options, method: 'POST' }));
    } catch {
        throw new ApiError('连不上服务端');
    }

    if (!response.ok) throw await toApiError(response);
    return response;
}

export function get<T>(path: string, options: { timeout?: number } = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' });
}

export function post<T>(
    path: string,
    body?: unknown,
    options: { timeout?: number } = {},
): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', body });
}

export function put<T>(
    path: string,
    body?: unknown,
    options: { timeout?: number } = {},
): Promise<T> {
    return request<T>(path, { ...options, method: 'PUT', body });
}

/** DELETE 不能叫 delete（关键字），所以叫 del */
export function del<T>(path: string, options: { timeout?: number } = {}): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' });
}
