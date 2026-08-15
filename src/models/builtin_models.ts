import { ModelInfo, ProviderType } from "../services/adapters";

/**
 * 内置模型条目。
 * 在 ModelInfo 基础上增加 default 标记，用于指定该 provider 的默认模型。
 */
export interface ModelEntry extends ModelInfo {
    default?: boolean;
}

/**
 * 内置模型列表——所有硬编码模型的唯一来源。
 *
 * 用户可以通过插件目录下的 models.json 覆盖/追加条目，见 services/model_registry.ts。
 * 新增内置模型时只需要改这里，不要再往 settings.ts 或各 adapter 里复制一份。
 *
 * openai / deepseek / custom 走 API 动态拉取，因此内置为空。
 */
export const BUILTIN_MODELS: Record<ProviderType, ModelEntry[]> = {
    gemini: [
        {
            id: 'gemini-3.5-flash',
            name: 'Gemini 3.5 Flash',
            contextWindow: 1000000,
            supportsFunctionCalling: true,
            supportsStreaming: true,
            default: true
        },
        {
            id: 'gemini-3.1-pro-preview',
            name: 'Gemini 3.1 Pro (Thinking)',
            contextWindow: 1000000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'gemini-3-pro-preview',
            name: 'Gemini 3.0 Pro (Thinking)',
            contextWindow: 1000000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'gemini-3-flash-preview',
            name: 'Gemini 3.0 Flash (Fast & Thinking)',
            contextWindow: 1000000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'gemini-2.5-flash',
            name: 'Gemini 2.5 Flash',
            contextWindow: 1000000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'gemini-2.0-flash-exp',
            name: 'Gemini 2.0 Flash (Experimental)',
            contextWindow: 1000000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'gemini-2.0-flash',
            name: 'Gemini 2.0 Flash',
            contextWindow: 1000000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        }
    ],
    anthropic: [
        {
            id: 'claude-opus-4-20250514',
            name: 'Claude Opus 4',
            contextWindow: 200000,
            supportsFunctionCalling: true,
            supportsStreaming: true,
            default: true
        },
        {
            id: 'claude-sonnet-4-20250514',
            name: 'Claude Sonnet 4',
            contextWindow: 200000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            contextWindow: 200000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'claude-3-5-haiku-20241022',
            name: 'Claude 3.5 Haiku',
            contextWindow: 200000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'claude-3-opus-20240229',
            name: 'Claude 3 Opus',
            contextWindow: 200000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        },
        {
            id: 'claude-3-haiku-20240307',
            name: 'Claude 3 Haiku',
            contextWindow: 200000,
            supportsFunctionCalling: true,
            supportsStreaming: true
        }
    ],
    openai: [],
    deepseek: [],
    custom: []
};

/**
 * 兜底模型 ID。
 * 仅用于无法访问 ModelRegistry 的静态上下文（如 DEFAULT_SETTINGS）。
 * 运行时请优先使用 modelRegistry.getDefaultModelId()。
 */
export const FALLBACK_MODEL_ID = 'gemini-3.5-flash';
