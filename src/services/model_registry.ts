import { App, Notice } from "obsidian";
import { ModelInfo, ProviderType } from "./adapters";
import { BUILTIN_MODELS, FALLBACK_MODEL_ID, ModelEntry } from "../models/builtin_models";

export const MODELS_CONFIG_FILENAME = 'models.json';

/**
 * 用户模型配置文件（插件目录下的 models.json）。
 *
 * 顶层 key 为 provider type，值为模型条目数组：
 * {
 *   "gemini": [{ "id": "gemini-4-pro", "name": "Gemini 4 Pro", "default": true }],
 *   "openai": [{ "id": "gpt-5", "name": "GPT-5" }]
 * }
 */
type ModelsConfigFile = Partial<Record<ProviderType, ModelEntry[]>>;

const KNOWN_PROVIDER_TYPES: ProviderType[] = ['gemini', 'openai', 'anthropic', 'deepseek', 'custom'];

/**
 * 模型注册表：内置列表 + 用户 models.json 的合并结果。
 *
 * 合并规则：
 *   - 内置（或 API 拉取结果）打底
 *   - 文件中相同 id 的条目浅合并到底表，保持原有位置
 *   - 文件中的新 id 按文件顺序插到列表最前
 *
 * 文件缺失、JSON 损坏或结构非法时一律回退到纯内置列表，
 * 保证「配错了也不会没有模型可用」。
 */
export class ModelRegistry {
    private overrides: ModelsConfigFile = {};

    /** 从插件目录读取 models.json。任何失败都回退到内置列表。 */
    async load(app: App, manifestDir: string): Promise<void> {
        const path = `${manifestDir}/${MODELS_CONFIG_FILENAME}`;

        let raw: string;
        try {
            if (!(await app.vault.adapter.exists(path))) {
                this.overrides = {};
                console.debug(`[ModelRegistry] No ${MODELS_CONFIG_FILENAME}, using builtin models only`);
                return;
            }
            raw = await app.vault.adapter.read(path);
        } catch (e) {
            this.overrides = {};
            console.error(`[ModelRegistry] Failed to read ${path}:`, e);
            return;
        }

        try {
            this.overrides = this.parseConfig(raw);
            const count = Object.values(this.overrides).reduce((n, list) => n + (list?.length ?? 0), 0);
            console.debug(`[ModelRegistry] Loaded ${count} model override(s) from ${MODELS_CONFIG_FILENAME}`);
        } catch (e) {
            this.overrides = {};
            console.error(`[ModelRegistry] Invalid ${MODELS_CONFIG_FILENAME}:`, e);
            const reason = e instanceof Error ? e.message : String(e);
            new Notice(`${MODELS_CONFIG_FILENAME} 格式有误，已回退到内置模型列表：${reason}`);
        }
    }

    /** 解析并校验配置文件内容，非法时抛错由 load() 统一处理。 */
    private parseConfig(raw: string): ModelsConfigFile {
        const parsed: unknown = JSON.parse(raw);

        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('顶层必须是对象，形如 { "gemini": [...] }');
        }

        const result: ModelsConfigFile = {};

        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            // 以 _ 开头的 key 视为注释，静默忽略
            if (key.startsWith('_')) continue;
            if (!KNOWN_PROVIDER_TYPES.includes(key as ProviderType)) {
                console.warn(`[ModelRegistry] Unknown provider type "${key}", ignored`);
                continue;
            }
            if (!Array.isArray(value)) {
                throw new Error(`"${key}" 必须是数组`);
            }

            const entries: ModelEntry[] = [];
            for (const item of value as unknown[]) {
                if (item === null || typeof item !== 'object' || Array.isArray(item)) {
                    throw new Error(`"${key}" 中存在非对象条目`);
                }
                const record = item as Record<string, unknown>;
                const id = typeof record.id === 'string' ? record.id.trim() : '';
                if (id.length === 0) {
                    throw new Error(`"${key}" 中存在缺少 id 的条目`);
                }
                const name = typeof record.name === 'string' && record.name.trim().length > 0
                    ? record.name
                    : id;
                entries.push({ ...record, id, name } as ModelEntry);
            }
            result[key as ProviderType] = entries;
        }

        return result;
    }

    /** 把用户覆盖合并到给定的底表（内置列表或 API 拉取结果）之上。 */
    mergeInto(type: ProviderType, base: ModelInfo[]): ModelEntry[] {
        const overrides = this.overrides[type] ?? [];
        if (overrides.length === 0) return [...(base as ModelEntry[])];

        const overrideById = new Map(overrides.map(m => [m.id, m]));

        const merged: ModelEntry[] = base.map(m => {
            const override = overrideById.get(m.id);
            return override ? { ...m, ...override } : { ...m };
        });

        const baseIds = new Set(base.map(m => m.id));
        const added = overrides.filter(m => !baseIds.has(m.id));

        return [...added, ...merged];
    }

    /** 该 provider 当前可用的模型列表（内置 + 用户覆盖），同步调用。 */
    getModels(type: ProviderType): ModelEntry[] {
        return this.mergeInto(type, BUILTIN_MODELS[type] ?? []);
    }

    /** 默认模型 ID：用户/内置的 default:true 条目 → 列表首条 → 兜底常量。 */
    getDefaultModelId(type: ProviderType = 'gemini'): string {
        const models = this.getModels(type);
        return models.find(m => m.default)?.id || models[0]?.id || FALLBACK_MODEL_ID;
    }
}

export const modelRegistry = new ModelRegistry();

/**
 * 结构化取 provider / 设置的最小形状。
 * 这里不直接 import VoyaruSettings / ProviderConfig，避免 settings.ts ←→ model_registry.ts 循环依赖。
 */
export interface ProviderLike {
    id?: string;
    type?: string;
    selectedModel?: string;
    models?: ModelInfo[];
}

interface SettingsLike {
    providers?: ProviderLike[];
    activeProviderId?: string;
}

/** 把任意字符串归一为已知的 ProviderType，无法识别时按 gemini 处理。 */
export function normalizeProviderType(type: string | undefined): ProviderType {
    return type && KNOWN_PROVIDER_TYPES.includes(type as ProviderType)
        ? (type as ProviderType)
        : 'gemini';
}

/**
 * 解析某个 provider 当前可选的模型列表。
 *
 * gemini / anthropic 有内置列表，以内置为底表；
 * openai / deepseek / custom 的列表来自 API 拉取并缓存在 provider.models 中，
 * 以该缓存为底表——否则用户在这些 provider 上拉取到的模型会被清空。
 * 两种情况都再叠加 models.json 中的用户覆盖。
 */
export function resolveProviderModels(provider: ProviderLike | undefined): ModelEntry[] {
    const type = normalizeProviderType(provider?.type);
    const builtin = BUILTIN_MODELS[type] ?? [];
    const base = builtin.length > 0 ? builtin : (provider?.models ?? []);
    return modelRegistry.mergeInto(type, base);
}

/** 某个 provider 的默认模型 ID：default:true 条目 → 列表首条 → 兜底常量。 */
export function getDefaultModelIdForProvider(provider: ProviderLike | undefined): string {
    const models = resolveProviderModels(provider);
    return models.find(m => m.default)?.id || models[0]?.id || FALLBACK_MODEL_ID;
}

/** 当前激活 provider 的类型，缺省为 gemini。 */
export function getActiveProviderType(settings: SettingsLike): ProviderType {
    return normalizeProviderType(
        settings.providers?.find(p => p.id === settings.activeProviderId)?.type
    );
}

/** 当前激活 provider 可选的模型列表（底表 + models.json 覆盖）。 */
export function getActiveProviderModels(settings: SettingsLike): ModelEntry[] {
    return resolveProviderModels(settings.providers?.find(p => p.id === settings.activeProviderId));
}

/** 当前激活 provider 选中的模型 ID，未设置时回退到该 provider 的默认模型。 */
export function getActiveModelId(settings: SettingsLike): string {
    const provider = settings.providers?.find(p => p.id === settings.activeProviderId);
    return provider?.selectedModel || getDefaultModelIdForProvider(provider);
}
