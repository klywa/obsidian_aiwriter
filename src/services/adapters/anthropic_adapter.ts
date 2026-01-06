import {
    BaseModelAdapter,
    AdapterConfig,
    ModelInfo,
    UnifiedMessage,
    UnifiedTool,
    UnifiedStreamChunk
} from "./base";

export class AnthropicAdapter extends BaseModelAdapter {
    private currentMessages: any[] = [];

    getProviderName(): string {
        return "Anthropic Claude";
    }

    async initClient(): Promise<void> {
        try {
            // 动态导入anthropic库
            const Anthropic = (await import('@anthropic-ai/sdk')).default;

            const clientConfig: any = {
                apiKey: this.config.apiKey
            };

            if (this.config.baseURL) {
                clientConfig.baseURL = this.config.baseURL;
            }

            this.client = new Anthropic(clientConfig);

            console.log('[AnthropicAdapter] Client initialized');
        } catch (e: any) {
            console.error('[AnthropicAdapter] Failed to initialize:', e);
            throw new Error(`Failed to initialize Anthropic client: ${e.message}`);
        }
    }

    async fetchAvailableModels(): Promise<ModelInfo[]> {
        // Anthropic不提供动态模型列表API，使用硬编码
        return [
            {
                id: 'claude-opus-4-20250514',
                name: 'Claude Opus 4',
                contextWindow: 200000,
                supportsFunctionCalling: true,
                supportsStreaming: true
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
        ];
    }

    private convertToClaudeTools(tools: UnifiedTool[]): any[] {
        return tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters
        }));
    }

    clearSession(sessionId: string): void {
        // Claude 无状态，清除本地消息缓存
        this.currentMessages = [];
        console.log(`[AnthropicAdapter] Cleared session: ${sessionId}`);
    }

    getOrCreateSession(sessionId: string, systemPrompt: string, tools: UnifiedTool[]): any {
        // Claude无状态，返回配置对象
        return {
            systemPrompt,
            tools
        };
    }

    async *streamChat(
        messages: UnifiedMessage[],
        systemPrompt: string,
        tools: UnifiedTool[],
        signal?: AbortSignal
    ): AsyncGenerator<UnifiedStreamChunk> {
        if (!this.client) {
            await this.initClient();
        }

        if (!this.client) {
            yield {
                type: 'error',
                content: 'Failed to initialize Anthropic client'
            };
            return;
        }

        const claudeMessages = messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
        }));

        this.currentMessages = claudeMessages;

        const claudeTools = this.convertToClaudeTools(tools);

        try {
            const params: any = {
                model: this.config.model,
                max_tokens: this.config.maxTokens || 4096,
                system: systemPrompt,
                messages: claudeMessages,
                stream: true,
                temperature: this.config.temperature,
                top_p: this.config.topP
            };

            if (claudeTools.length > 0) {
                params.tools = claudeTools;
            }

            const stream = await this.client.messages.create(params);

            let currentToolUse: any = null;

            for await (const event of stream) {
                if (signal?.aborted) break;

                if (event.type === 'content_block_start') {
                    if (event.content_block.type === 'tool_use') {
                        currentToolUse = {
                            id: event.content_block.id,
                            name: event.content_block.name,
                            input: {}
                        };
                    }
                }

                if (event.type === 'content_block_delta') {
                    if (event.delta.type === 'text_delta') {
                        yield {
                            type: 'text',
                            content: event.delta.text
                        };
                    }

                    if (event.delta.type === 'input_json_delta' && currentToolUse) {
                        // Claude 流式返回工具输入的JSON片段
                        currentToolUse.inputJson = (currentToolUse.inputJson || '') + event.delta.partial_json;
                    }
                }

                if (event.type === 'content_block_stop' && currentToolUse) {
                    // 工具调用完成
                    try {
                        const input = currentToolUse.inputJson ? JSON.parse(currentToolUse.inputJson) : currentToolUse.input;
                        yield {
                            type: 'tool_call',
                            toolCall: {
                                id: currentToolUse.id,
                                name: currentToolUse.name,
                                arguments: input
                            }
                        };
                    } catch (e) {
                        console.error('[AnthropicAdapter] Failed to parse tool input:', e);
                    }
                    currentToolUse = null;
                }
            }

            yield { type: 'text', content: '', done: true };
        } catch (error: any) {
            console.error('[AnthropicAdapter] Stream error:', error);
            yield {
                type: 'error',
                content: error.message || 'Unknown error occurred'
            };
        }
    }

    async *continueWithToolResult(
        chatSession: any,
        toolResults: Record<string, any>,
        signal?: AbortSignal
    ): AsyncGenerator<UnifiedStreamChunk> {
        try {
            // Claude需要将工具结果作为用户消息的一部分发送
            const toolResultContent = Object.entries(toolResults).map(([name, result]) => ({
                type: 'tool_result',
                tool_use_id: result.id || crypto.randomUUID(),
                content: typeof result === 'string' ? result : JSON.stringify(result)
            }));

            // 添加一个包含工具结果的用户消息
            this.currentMessages.push({
                role: 'user',
                content: toolResultContent
            });

            const claudeTools = this.convertToClaudeTools(chatSession.tools || []);

            const params: any = {
                model: this.config.model,
                max_tokens: this.config.maxTokens || 4096,
                system: chatSession.systemPrompt,
                messages: this.currentMessages,
                stream: true,
                temperature: this.config.temperature,
                top_p: this.config.topP
            };

            if (claudeTools.length > 0) {
                params.tools = claudeTools;
            }

            const stream = await this.client.messages.create(params);

            let currentToolUse: any = null;

            for await (const event of stream) {
                if (signal?.aborted) break;

                if (event.type === 'content_block_start') {
                    if (event.content_block.type === 'tool_use') {
                        currentToolUse = {
                            id: event.content_block.id,
                            name: event.content_block.name,
                            input: {}
                        };
                    }
                }

                if (event.type === 'content_block_delta') {
                    if (event.delta.type === 'text_delta') {
                        yield {
                            type: 'text',
                            content: event.delta.text
                        };
                    }

                    if (event.delta.type === 'input_json_delta' && currentToolUse) {
                        currentToolUse.inputJson = (currentToolUse.inputJson || '') + event.delta.partial_json;
                    }
                }

                if (event.type === 'content_block_stop' && currentToolUse) {
                    try {
                        const input = currentToolUse.inputJson ? JSON.parse(currentToolUse.inputJson) : currentToolUse.input;
                        yield {
                            type: 'tool_call',
                            toolCall: {
                                id: currentToolUse.id,
                                name: currentToolUse.name,
                                arguments: input
                            }
                        };
                    } catch (e) {
                        console.error('[AnthropicAdapter] Failed to parse tool input:', e);
                    }
                    currentToolUse = null;
                }
            }

            yield { type: 'text', content: '', done: true };
        } catch (error: any) {
            console.error('[AnthropicAdapter] Tool result continuation error:', error);
            yield {
                type: 'error',
                content: error.message || 'Unknown error occurred'
            };
        }
    }
}
