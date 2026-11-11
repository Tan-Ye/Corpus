import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));

// 只在非 production 读；文件不存在就跳过，不崩
if (process.env.NODE_ENV !== 'production' && existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

// 只有 PORT 有默认值；LLM 三个变量缺了让 initLLMConfig 报错，别静默回落到某个模型
const env = {
  PORT: Number(process.env.PORT) || 8787,
  LLM_BASE_URL: process.env.LLM_BASE_URL || '',
  LLM_MODEL: process.env.LLM_MODEL || '',
  LLM_API_KEY: process.env.LLM_API_KEY || '',
}

export default env
