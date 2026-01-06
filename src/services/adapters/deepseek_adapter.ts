import { OpenAIAdapter } from "./openai_adapter";
import { ModelInfo } from "./base";

// DeepSeek使用OpenAI兼容接口，直接继承OpenAIAdapter
export class DeepSeekAdapter extends OpenAIAdapter {
    getProviderName(): string {
        return "DeepSeek";
    }

    async initClient(): Promise<void> {
        // DeepSeek使用特定的baseURL
        if (!this.config.baseURL) {
            this.config.baseURL = 'https://api.deepseek.com/v1';
        }
        await super.initClient();
    }

    async fetchAvailableModels(): Promise<ModelInfo[]> {
        try {
            // 尝试动态获取模型列表
            const models = await super.fetchAvailableModels();
            // 过滤出DeepSeek的模型
            return models.filter(m =>
                m.id.includes('deepseek') ||
                m.id.includes('chat') ||
                m.id.includes('coder')
            );
        } catch (e) {
            console.warn('[DeepSeekAdapter] Failed to fetch models dynamically, using fallback list:', e);
            // 返回DeepSeek常用模型作为后备
            return [
                {
                    id: 'deepseek-chat',
                    name: 'DeepSeek Chat',
                    contextWindow: 64000,
                    supportsFunctionCalling: true,
                    supportsStreaming: true
                },
                {
                    id: 'deepseek-coder',
                    name: 'DeepSeek Coder',
                    contextWindow: 64000,
                    supportsFunctionCalling: true,
                    supportsStreaming: true
                },
                {
                    id: 'deepseek-reasoner',
                    name: 'DeepSeek Reasoner (R1)',
                    contextWindow: 64000,
                    supportsFunctionCalling: false, // R1可能不支持function calling
                    supportsStreaming: true
                }
            ];
        }
    }
}
