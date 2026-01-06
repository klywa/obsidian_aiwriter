// 统一的消息格式
export interface UnifiedMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// 统一的工具定义
export interface UnifiedTool {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required: string[];
    };
}

// 统一的工具调用格式
export interface UnifiedToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

// 统一的流式响应块
export interface UnifiedStreamChunk {
    type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'error';
    content?: string;
    toolCall?: UnifiedToolCall;
    toolResult?: any;
    done?: boolean;
}

// 模型信息
export interface ModelInfo {
    id: string;
    name: string;
    contextWindow?: number;
    supportsFunctionCalling?: boolean;
    supportsStreaming?: boolean;
}

// 适配器配置
export interface AdapterConfig {
    apiKey: string;
    baseURL?: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
}

// 抽象适配器基类
export abstract class BaseModelAdapter {
    protected config: AdapterConfig;
    protected client: any = null;

    constructor(config: AdapterConfig) {
        this.config = config;
    }

    // 子类必须实现：初始化客户端
    abstract initClient(): Promise<void>;

    // 子类必须实现：获取可用模型列表
    abstract fetchAvailableModels(): Promise<ModelInfo[]>;

    // 子类必须实现：流式聊天
    abstract streamChat(
        messages: UnifiedMessage[],
        systemPrompt: string,
        tools: UnifiedTool[],
        signal?: AbortSignal
    ): AsyncGenerator<UnifiedStreamChunk>;

    // 子类必须实现：处理工具调用结果
    abstract continueWithToolResult(
        chatSession: any,
        toolResults: Record<string, any>,
        signal?: AbortSignal
    ): AsyncGenerator<UnifiedStreamChunk>;

    // 工具类方法：更新配置
    updateConfig(config: Partial<AdapterConfig>): void {
        this.config = { ...this.config, ...config };
    }

    // 工具类方法：获取提供商名称
    abstract getProviderName(): string;

    // 工具类方法：清除会话缓存
    abstract clearSession(sessionId: string): void;

    // 工具类方法：获取或创建会话
    abstract getOrCreateSession(sessionId: string, systemPrompt: string, tools: UnifiedTool[]): any;
}
