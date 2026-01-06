import { OpenAIAdapter } from "./openai_adapter";
import { ModelInfo } from "./base";

// 自定义适配器，用于支持兼容OpenAI格式的任意API
export class CustomAdapter extends OpenAIAdapter {
    getProviderName(): string {
        return "Custom API";
    }

    async initClient(): Promise<void> {
        if (!this.config.baseURL) {
            throw new Error("Custom API requires baseURL to be configured");
        }
        await super.initClient();
    }

    async fetchAvailableModels(): Promise<ModelInfo[]> {
        try {
            // 尝试从API获取模型列表
            return await super.fetchAvailableModels();
        } catch (e) {
            console.warn('[CustomAdapter] Failed to fetch models, returning empty list. Please configure model ID manually:', e);
            // 对于自定义API，如果无法获取模型列表，返回空数组
            // 用户需要手动输入模型ID
            return [];
        }
    }
}
