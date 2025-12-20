import { GoogleGenAI, Content, Part, Tool, Type } from "@google/genai";
import { FSService } from "./fs_service";
import { VoyaruSettings } from "../settings";
import { Notice } from "obsidian";

export class AIService {
    private genAI: GoogleGenAI | null = null;
    private fs: FSService;
    private settings: VoyaruSettings;

    constructor(settings: VoyaruSettings, fs: FSService) {
        this.settings = settings;
        this.fs = fs;
        this.initClient();
    }

    initClient() {
         const trimmedKey = this.settings.apiKey?.trim();
         if (trimmedKey && trimmedKey.length > 0) {
             try {
                 this.genAI = new GoogleGenAI({ apiKey: trimmedKey });
                 console.log('AI client initialized successfully with @google/genai');
             } catch (e) {
                 console.error('Failed to initialize AI client:', e);
                 this.genAI = null;
             }
         } else {
             console.log('API Key is empty, genAI set to null');
             this.genAI = null;
         }
    }
    
    updateSettings(settings: VoyaruSettings) {
        // Only re-initialize if API Key or Model has changed
        if (this.settings.apiKey !== settings.apiKey || this.settings.model !== settings.model) {
            console.log('API Key or Model changed, re-initializing AI client');
            this.settings = settings;
            this.initClient();
        } else {
            // Just update settings reference
            this.settings = settings;
        }
    }

    async *streamChat(history: Content[], newMessage: string, referencedFiles: string[] = []): AsyncGenerator<any, void, unknown> {
        try {
        // 检查API Key
        const trimmedKey = this.settings.apiKey?.trim();
        if (!trimmedKey || trimmedKey.length === 0) {
            new Notice("请先在设置中配置 API Key。");
            yield { type: "error", content: "API Key 未设置。请前往 设置 → Voyaru Agent 配置 API Key。" };
            return;
        }
        
        // 如果genAI未初始化，重新初始化
        if (!this.genAI) {
            console.log('Reinitializing AI client with API Key');
            this.initClient();
        }
        
        // 再次检查（初始化后）
        if (!this.genAI) {
            new Notice("API Key 无效，请检查设置。");
            yield { type: "error", content: `API Key 无效。当前 API Key: ${trimmedKey ? '***' + trimmedKey.slice(-4) : '空'}。请检查 API Key 是否正确。` };
            return;
        }

        // Prepare context
        let contextContent = "";
        for (const fileRef of referencedFiles) {
            try {
                // 检查是否包含行数区间（格式：filepath:start-end）
                const match = fileRef.match(/^(.+):(\d+)-(\d+)$/);
                if (match && match[1] && match[2] && match[3]) {
                    const filePath = match[1]!;
                    const startLineStr = match[2]!;
                    const endLineStr = match[3]!;
                    const startLine = parseInt(startLineStr) - 1; // 转换为0-based
                    const endLine = parseInt(endLineStr) - 1;
                    const content = await this.fs.readFile(filePath);
                    const lines = content.split('\n');
                    const selectedLines = lines.slice(startLine, endLine + 1);
                    contextContent += `\n--- File: ${filePath} (Lines ${startLineStr}-${endLineStr}) ---\n${selectedLines.join('\n')}\n--- End of Selection ---\n`;
                } else {
                    // 没有行数区间，读取整个文件
                    const content = await this.fs.readFile(fileRef);
                    contextContent += `\n--- File: ${fileRef} ---\n${content}\n--- End of File ---\n`;
                }
            } catch (e) {
                console.warn(`Failed to read referenced file ${fileRef}`, e);
            }
        }
        
        // Prepare tools (using new SDK Tool format)
         const tools: Tool[] = [
             {
               functionDeclarations: [
                 {
                   name: "writeFile",
                   description: "Create or overwrite a file with content. Use this to save chapters, outlines, characters, etc.",
                   parameters: {
                     type: Type.OBJECT,
                     properties: {
                       path: { type: Type.STRING, description: "The path to the file. (e.g., 'Chapters/第1回.md')" },
                       content: { type: Type.STRING, description: "The full content to write to the file." },
                     },
                     required: ["path", "content"],
                   },
                 },
                 {
                   name: "readFile",
                   description: "Read the content of a file to get context.",
                   parameters: {
                     type: Type.OBJECT,
                     properties: {
                       path: { type: Type.STRING, description: "The path to the file." },
                     },
                     required: ["path"],
                   },
                 },
                  {
                   name: "deleteFile",
                   description: "Delete a file.",
                   parameters: {
                     type: Type.OBJECT,
                     properties: {
                       path: { type: Type.STRING, description: "The path to the file." },
                     },
                     required: ["path"],
                   },
                 }
               ],
             },
           ];
           
        // Use SDK's ChatSession to manage history and state automatically.
        // This is CRITICAL for Thinking models to preserve 'thought_signature' in history.
        // We initialize with the PREVIOUS history (not including current turn).
        // Filter history to ensure only valid roles are passed
        const validRoles = ['user', 'model'];
        let cleanHistory = history.filter(h => h.role && validRoles.includes(h.role));
        
        // Sanitize history logic (same as before)
        if (cleanHistory.length > 0) {
            const lastMsg = cleanHistory[cleanHistory.length - 1];
            // Check for trailing function call without response
            // New SDK structure: parts is optional or null?
            if (lastMsg && lastMsg.role === 'model' && lastMsg.parts?.some((p: any) => p.functionCall)) {
                console.warn('Found trailing function call in history, removing it to prevent API error.');
                cleanHistory.pop();
            }
        }
        // Remove leading function response
        if (cleanHistory.length > 0) {
            const firstMsg = cleanHistory[0];
            if (firstMsg && firstMsg.role === 'user' && firstMsg.parts?.some((p: any) => p.functionResponse)) {
                 console.warn('Found leading function response in history, removing it to prevent API error.');
                 cleanHistory.shift();
            }
        }
        // Scan middle
        const validatedHistory: Content[] = [];
        let expectingFunctionResponse = false;
        
        for (const msg of cleanHistory) {
            const hasFunctionCall = msg.role === 'model' && msg.parts?.some((p: any) => p.functionCall);
            const hasFunctionResponse = msg.role === 'user' && msg.parts?.some((p: any) => p.functionResponse);
            
            if (expectingFunctionResponse) {
                if (hasFunctionResponse) {
                    validatedHistory.push(msg);
                    expectingFunctionResponse = false;
                } else {
                    console.warn('Found broken function call chain (missing response), dropping previous call.');
                    validatedHistory.pop(); 
                    expectingFunctionResponse = false;
                    
                    if (hasFunctionCall) {
                        validatedHistory.push(msg);
                        expectingFunctionResponse = true;
                    } else if (hasFunctionResponse) {
                         console.warn('Found orphaned function response, dropping.');
                    } else {
                        validatedHistory.push(msg);
                    }
                }
            } else {
                if (hasFunctionCall) {
                    validatedHistory.push(msg);
                    expectingFunctionResponse = true;
                } else if (hasFunctionResponse) {
                    console.warn('Found orphaned function response, dropping.');
                } else {
                    validatedHistory.push(msg);
                }
            }
        }
        if (expectingFunctionResponse) {
             console.warn('History ended with function call, dropping it.');
             validatedHistory.pop();
        }
        cleanHistory = validatedHistory;

        console.log('Starting chat with clean history length:', cleanHistory.length);

        // Create chat using new SDK
        const chat = this.genAI.chats.create({
            model: this.settings.model || "gemini-2.0-flash", // Ensure string
            config: {
                systemInstruction: this.settings.systemPrompt,
                tools: tools,
            },
            history: cleanHistory
        });

        // Construct current user message
        let msgToSend: Part[] | string = contextContent ? `${contextContent}\n\nUser Query: ${newMessage}` : newMessage;
        
        console.log('Final message to send (truncated):', typeof msgToSend === 'string' ? msgToSend.substring(0, 500) + '...' : 'Part[] content');

        // Loop for tool calls
        while (true) {
            let stream;
            try {
                console.log('Sending message to Gemini API, model:', this.settings.model);
                stream = await chat.sendMessageStream({ message: msgToSend });
                console.log('Received response stream from Gemini API');
            } catch (e: any) {
                 console.error("Gemini API Error", e);
                 const errorMessage = e.message || e.toString() || "Unknown error";
                 const errorDetails = e.statusCode ? `Status: ${e.statusCode}, ` : '';
                 yield { type: "error", content: `连接 Gemini API 时出错: ${errorDetails}${errorMessage}` };
                 return;
            }
            
            let fullText = "";
            let hasReceivedText = false;
            let functionCalls: any[] = [];
            
            try {
                for await (const chunk of stream) {
                     const text = chunk.text;
                     if (text) {
                         hasReceivedText = true;
                         fullText += text;
                         yield { type: "text", content: text };
                     }
                     
                     // New SDK: functionCalls is a property getter on chunk (GenerateContentResponse)
                     const calls = chunk.functionCalls;
                     if (calls && calls.length > 0) {
                         functionCalls.push(...calls);
                         for (const call of calls) {
                             yield { type: "thinking", content: `调用工具: ${call.name}` };
                         }
                     }
                }
                
            } catch (streamError: any) {
                console.error("Error processing stream:", streamError);
                yield { type: "error", content: `处理响应流时出错: ${streamError.message || streamError.toString()}` };
                return;
            }

            // Check if there are function calls to execute
            // Note: In streaming, we collect all function calls from chunks.
            // But we need to execute them and send response.
            // The `stream` loop finishes when the model turn is "done" (either stop or function call).
            
            if (functionCalls.length > 0) {
                 const functionResponses: Part[] = [];
                 
                 for (const call of functionCalls) {
                     const { name, args } = call;
                     // New SDK args might be object directly? Yes.
                     const toolArgs = args as any;
                     let output = "";
                     try {
                        if (name === "writeFile") {
                            await this.fs.writeFile(toolArgs.path, toolArgs.content);
                            output = `File ${toolArgs.path} written successfully.`;
                        } else if (name === "readFile") {
                            output = await this.fs.readFile(toolArgs.path);
                        } else if (name === "deleteFile") {
                            await this.fs.deleteFile(toolArgs.path);
                            output = `File ${toolArgs.path} deleted successfully.`;
                        } else {
                            output = "Unknown tool.";
                        }
                     } catch (e: any) {
                         output = `Error executing ${name}: ${e.message}`;
                     }
                     
                     yield { type: "tool_result", tool: name, result: output };
                     
                     functionResponses.push({
                         functionResponse: {
                             name: name,
                             response: { result: output }
                         }
                     });
                 }
                 
                 // Send function responses back to the model to complete the turn
                 // msgToSend must be compatible with SendMessageParameters 'message'
                 // In new SDK, we can pass Part[] directly or object
                 msgToSend = functionResponses;
                 continue;
            }
            
            // If no tool calls, we are done with this turn.
            // Check if we received any text response
            if (!hasReceivedText && fullText.length === 0) {
                console.warn('No text response received from model');
                yield { type: "error", content: "模型没有返回文本响应。请检查模型配置和提示词，或查看控制台获取详细错误信息。" };
            }
            
            // Retrieve history
            try {
                const updatedHistory = await chat.getHistory();
                yield { type: 'history_update', history: updatedHistory };
            } catch (e: any) {
                console.error("Error getting chat history:", e);
            }
            break;
        }
    } catch (globalError: any) {
            console.error("Critical error in streamChat:", globalError);
            yield { type: "error", content: `系统错误: ${globalError.message || "未知错误"}` };
        }
    }
}
