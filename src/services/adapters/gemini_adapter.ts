import { GoogleGenAI, Content, Part, Tool, Type } from "@google/genai";
import {
    BaseModelAdapter,
    AdapterConfig,
    ModelInfo,
    UnifiedMessage,
    UnifiedTool,
    UnifiedStreamChunk,
    UnifiedToolCall
} from "./base";
import { BUILTIN_MODELS } from "../../models/builtin_models";

export class GeminiAdapter extends BaseModelAdapter {
    private genAI: GoogleGenAI | null = null;
    private activeChats: Map<string, any> = new Map();

    getProviderName(): string {
        return "Google Gemini";
    }

    async initClient(): Promise<void> {
        if (!this.config.apiKey || this.config.apiKey.trim().length === 0) {
            throw new Error("Gemini API Key is required");
        }

        try {
            const clientConfig: any = {
                apiKey: this.config.apiKey.trim()
            };

            if (this.config.baseURL) {
                clientConfig.baseURL = this.config.baseURL;
            }

            this.genAI = new GoogleGenAI(clientConfig);
            console.log('[GeminiAdapter] Client initialized successfully');
        } catch (e) {
            console.error('[GeminiAdapter] Failed to initialize:', e);
            throw e;
        }
    }

    async fetchAvailableModels(): Promise<ModelInfo[]> {
        // Gemini的模型列表，API不提供动态获取，使用内置列表
        // 用户覆盖由调用方通过 modelRegistry.mergeInto('gemini', ...) 合并
        return BUILTIN_MODELS.gemini;
    }

    private convertToGeminiMessages(messages: UnifiedMessage[]): Content[] {
        return messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }]
        }));
    }

    private convertToGeminiTools(tools: UnifiedTool[]): Tool[] {
        if (tools.length === 0) return [];

        return [{
            functionDeclarations: tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                parameters: {
                    ...tool.parameters,
                    type: tool.parameters.type as Type
                }
            }))
        }];
    }

    clearSession(sessionId: string): void {
        if (this.activeChats.has(sessionId)) {
            this.activeChats.delete(sessionId);
            console.log(`[GeminiAdapter] Cleared session: ${sessionId}`);
        }
    }

    getOrCreateSession(sessionId: string, systemPrompt: string, tools: UnifiedTool[]): any {
        if (this.activeChats.has(sessionId)) {
            return this.activeChats.get(sessionId);
        }

        if (!this.genAI) {
            throw new Error("Gemini client not initialized");
        }

        const geminiTools = this.convertToGeminiTools(tools);

        const chat = this.genAI.chats.create({
            model: this.config.model,
            config: {
                systemInstruction: systemPrompt,
                tools: geminiTools.length > 0 ? geminiTools : undefined,
                temperature: this.config.temperature,
                maxOutputTokens: this.config.maxTokens,
                topP: this.config.topP
            },
            history: []
        });

        this.activeChats.set(sessionId, chat);
        console.log(`[GeminiAdapter] Created new session: ${sessionId}`);

        return chat;
    }

    async *streamChat(
        messages: UnifiedMessage[],
        systemPrompt: string,
        tools: UnifiedTool[],
        signal?: AbortSignal
    ): AsyncGenerator<UnifiedStreamChunk> {
        if (!this.genAI) {
            await this.initClient();
        }

        if (!this.genAI) {
            yield {
                type: 'error',
                content: 'Failed to initialize Gemini client'
            };
            return;
        }

        const geminiMessages = this.convertToGeminiMessages(messages);
        const geminiTools = this.convertToGeminiTools(tools);

        try {
            const chat = this.genAI.chats.create({
                model: this.config.model,
                config: {
                    systemInstruction: systemPrompt,
                    tools: geminiTools.length > 0 ? geminiTools : undefined,
                    temperature: this.config.temperature,
                    maxOutputTokens: this.config.maxTokens,
                    topP: this.config.topP
                },
                history: []
            });

            const lastMessage = messages[messages.length - 1]?.content || '';
            const stream = await chat.sendMessageStream({
                message: lastMessage
            });

            for await (const chunk of stream) {
                if (signal?.aborted) break;

                // 处理文本块
                if (chunk.text) {
                    yield {
                        type: 'text',
                        content: chunk.text
                    };
                }

                // 处理思考块
                if ((chunk as any).thinking) {
                    yield {
                        type: 'thinking',
                        content: (chunk as any).thinking
                    };
                }

                // 处理工具调用
                if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                    for (const call of chunk.functionCalls) {
                        yield {
                            type: 'tool_call',
                            toolCall: {
                                id: call.id || crypto.randomUUID(),
                                name: call.name || '',
                                arguments: call.args || {}
                            }
                        };
                    }
                }
            }

            yield { type: 'text', content: '', done: true };
        } catch (error: any) {
            console.error('[GeminiAdapter] Stream error:', error);
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
            // 将工具结果转换为Gemini格式
            const functionResponses = Object.entries(toolResults).map(([name, result]) => ({
                name,
                response: result
            }));

            const stream = await chatSession.sendMessageStream({
                functionResponses
            }, { signal });

            for await (const chunk of stream) {
                if (signal?.aborted) break;

                if (chunk.text) {
                    yield { type: 'text', content: chunk.text };
                }

                if (chunk.thinking) {
                    yield { type: 'thinking', content: chunk.thinking };
                }

                // 可能还有后续的工具调用
                if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                    for (const call of chunk.functionCalls) {
                        yield {
                            type: 'tool_call',
                            toolCall: {
                                id: call.id || crypto.randomUUID(),
                                name: call.name,
                                arguments: call.args
                            }
                        };
                    }
                }
            }

            yield { type: 'text', content: '', done: true };
        } catch (error: any) {
            console.error('[GeminiAdapter] Tool result continuation error:', error);
            yield {
                type: 'error',
                content: error.message || 'Unknown error occurred'
            };
        }
    }
}
