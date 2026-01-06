export * from './base';
export { GeminiAdapter } from './gemini_adapter';
export { OpenAIAdapter } from './openai_adapter';
export { AnthropicAdapter } from './anthropic_adapter';
export { DeepSeekAdapter } from './deepseek_adapter';
export { CustomAdapter } from './custom_adapter';

import { BaseModelAdapter, AdapterConfig } from './base';
import { GeminiAdapter } from './gemini_adapter';
import { OpenAIAdapter } from './openai_adapter';
import { AnthropicAdapter } from './anthropic_adapter';
import { DeepSeekAdapter } from './deepseek_adapter';
import { CustomAdapter } from './custom_adapter';

export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'custom';

export function createAdapter(provider: ProviderType, config: AdapterConfig): BaseModelAdapter {
    switch (provider) {
        case 'gemini':
            return new GeminiAdapter(config);
        case 'openai':
            return new OpenAIAdapter(config);
        case 'anthropic':
            return new AnthropicAdapter(config);
        case 'deepseek':
            return new DeepSeekAdapter(config);
        case 'custom':
            return new CustomAdapter(config);
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

// 提供商显示名称映射
export const PROVIDER_NAMES: Record<ProviderType, string> = {
    'gemini': 'Google Gemini',
    'openai': 'OpenAI',
    'anthropic': 'Anthropic Claude',
    'deepseek': 'DeepSeek',
    'custom': 'Custom API (OpenAI Compatible)'
};
