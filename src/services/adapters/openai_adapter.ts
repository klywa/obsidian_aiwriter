import {
    BaseModelAdapter,
    AdapterConfig,
    ModelInfo,
    UnifiedMessage,
    UnifiedTool,
    UnifiedStreamChunk
} from "./base";

export class OpenAIAdapter extends BaseModelAdapter {
    protected client: any = null;
    private currentMessages: any[] = [];

    getProviderName(): string {
        return "OpenAI";
    }

    async initClient(): Promise<void> {
        try {
            // 动态导入openai库
            const OpenAI = (await import('openai')).default;

            this.client = new OpenAI({
                apiKey: this.config.apiKey,
                baseURL: this.config.baseURL,
                dangerouslyAllowBrowser: true // Obsidian环境需要
            });

            console.log('[OpenAIAdapter] Client initialized');
        } catch (e: any) {
            console.error('[OpenAIAdapter] Failed to initialize:', e);
            throw new Error(`Failed to initialize OpenAI client: ${e.message}`);
        }
    }

    async fetchAvailableModels(): Promise<ModelInfo[]> {
        try {
            if (!this.client) {
                await this.initClient();
            }

            const response = await this.client.models.list();
            return response.data
                .filter((m: any) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3'))
                .map((m: any) => ({
                    id: m.id,
                    name: m.id,
                    supportsFunctionCalling: !m.id.includes('o1'), // o1系列不支持function calling
                    supportsStreaming: true
                }))
                .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name));
        } catch (e) {
            console.error('[OpenAIAdapter] Failed to fetch models:', e);
            // 返回常用模型作为后备
            return [
                { id: 'gpt-4o', name: 'GPT-4o', supportsFunctionCalling: true, supportsStreaming: true },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', supportsFunctionCalling: true, supportsStreaming: true },
                { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', supportsFunctionCalling: true, supportsStreaming: true },
                { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', supportsFunctionCalling: true, supportsStreaming: true },
                { id: 'o1', name: 'O1', supportsFunctionCalling: false, supportsStreaming: true },
                { id: 'o1-mini', name: 'O1 Mini', supportsFunctionCalling: false, supportsStreaming: true }
            ];
        }
    }

    private convertToOpenAITools(tools: UnifiedTool[]): any[] {
        return tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
    }

    clearSession(sessionId: string): void {
        // OpenAI 无状态，清除本地消息缓存即可
        this.currentMessages = [];
        console.log(`[OpenAIAdapter] Cleared session: ${sessionId}`);
    }

    getOrCreateSession(sessionId: string, systemPrompt: string, tools: UnifiedTool[]): any {
        // OpenAI无状态，返回配置对象
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
                content: 'Failed to initialize OpenAI client'
            };
            return;
        }

        const openaiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            }))
        ];

        this.currentMessages = openaiMessages;

        const openaiTools = this.convertToOpenAITools(tools);

        try {
            const params: any = {
                model: this.config.model,
                messages: openaiMessages,
                stream: true,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
                top_p: this.config.topP
            };

            if (openaiTools.length > 0) {
                params.tools = openaiTools;
            }

            const stream = await this.client.chat.completions.create(params, { signal });

            let currentToolCalls: any[] = [];

            for await (const chunk of stream) {
                if (signal?.aborted) break;

                const delta = chunk.choices[0]?.delta;

                if (delta?.content) {
                    yield {
                        type: 'text',
                        content: delta.content
                    };
                }

                if (delta?.tool_calls) {
                    for (const toolCall of delta.tool_calls) {
                        const index = toolCall.index;

                        // 初始化或更新工具调用
                        if (!currentToolCalls[index]) {
                            currentToolCalls[index] = {
                                id: toolCall.id || '',
                                name: toolCall.function?.name || '',
                                arguments: ''
                            };
                        }

                        if (toolCall.id) {
                            currentToolCalls[index].id = toolCall.id;
                        }

                        if (toolCall.function?.name) {
                            currentToolCalls[index].name = toolCall.function.name;
                        }

                        if (toolCall.function?.arguments) {
                            currentToolCalls[index].arguments += toolCall.function.arguments;
                        }
                    }
                }
            }

            // 流结束后，处理完整的工具调用
            if (currentToolCalls.length > 0) {
                for (const toolCall of currentToolCalls) {
                    if (toolCall && toolCall.name) {
                        try {
                            const args = JSON.parse(toolCall.arguments);
                            yield {
                                type: 'tool_call',
                                toolCall: {
                                    id: toolCall.id,
                                    name: toolCall.name,
                                    arguments: args
                                }
                            };
                        } catch (e) {
                            console.error('[OpenAIAdapter] Failed to parse tool arguments:', e);
                        }
                    }
                }
            }

            yield { type: 'text', content: '', done: true };
        } catch (error: any) {
            console.error('[OpenAIAdapter] Stream error:', error);
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
            // OpenAI需要将工具结果作为新消息发送
            const toolMessages = Object.entries(toolResults).map(([name, result]) => ({
                role: 'tool' as const,
                tool_call_id: result.id || crypto.randomUUID(),
                content: typeof result === 'string' ? result : JSON.stringify(result)
            }));

            this.currentMessages.push(...toolMessages);

            const openaiTools = this.convertToOpenAITools(chatSession.tools || []);

            const params: any = {
                model: this.config.model,
                messages: this.currentMessages,
                stream: true,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
                top_p: this.config.topP
            };

            if (openaiTools.length > 0) {
                params.tools = openaiTools;
            }

            const stream = await this.client.chat.completions.create(params, { signal });

            let currentToolCalls: any[] = [];

            for await (const chunk of stream) {
                if (signal?.aborted) break;

                const delta = chunk.choices[0]?.delta;

                if (delta?.content) {
                    yield {
                        type: 'text',
                        content: delta.content
                    };
                }

                if (delta?.tool_calls) {
                    for (const toolCall of delta.tool_calls) {
                        const index = toolCall.index;

                        if (!currentToolCalls[index]) {
                            currentToolCalls[index] = {
                                id: toolCall.id || '',
                                name: toolCall.function?.name || '',
                                arguments: ''
                            };
                        }

                        if (toolCall.id) {
                            currentToolCalls[index].id = toolCall.id;
                        }

                        if (toolCall.function?.name) {
                            currentToolCalls[index].name = toolCall.function.name;
                        }

                        if (toolCall.function?.arguments) {
                            currentToolCalls[index].arguments += toolCall.function.arguments;
                        }
                    }
                }
            }

            // 处理完整的工具调用
            if (currentToolCalls.length > 0) {
                for (const toolCall of currentToolCalls) {
                    if (toolCall && toolCall.name) {
                        try {
                            const args = JSON.parse(toolCall.arguments);
                            yield {
                                type: 'tool_call',
                                toolCall: {
                                    id: toolCall.id,
                                    name: toolCall.name,
                                    arguments: args
                                }
                            };
                        } catch (e) {
                            console.error('[OpenAIAdapter] Failed to parse tool arguments:', e);
                        }
                    }
                }
            }

            yield { type: 'text', content: '', done: true };
        } catch (error: any) {
            console.error('[OpenAIAdapter] Tool result continuation error:', error);
            yield {
                type: 'error',
                content: error.message || 'Unknown error occurred'
            };
        }
    }
}
