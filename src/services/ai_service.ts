import { GoogleGenAI, Content, Part, Tool, Type } from "@google/genai";
import { FSService } from "./fs_service";
import { VoyaruSettings, DEFAULT_SETTINGS } from "../settings";
import { Notice } from "obsidian";

export class AIService {
    private genAI: GoogleGenAI | null = null;
    private fs: FSService;
    private settings: VoyaruSettings;
    private activeChats: Map<string, any> = new Map();

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

    getProcessedSystemPrompt(): string {
        let prompt = this.settings.systemPrompt;
        if (!prompt || prompt.trim().length === 0) {
            prompt = DEFAULT_SETTINGS.systemPrompt;
        }
        
        const folders = this.settings.folders;
        
        if (folders) {
            prompt = prompt.replace(/\{chapters\}/g, folders.chapters || "Chapters");
            prompt = prompt.replace(/\{characters\}/g, folders.characters || "Characters");
            prompt = prompt.replace(/\{outlines\}/g, folders.outlines || "Outlines");
            prompt = prompt.replace(/\{notes\}/g, folders.notes || "Notes");
            prompt = prompt.replace(/\{knowledge\}/g, folders.knowledge || "Knowledge");
        }
        
        // 根据引用模式添加额外说明
        if (this.settings.referenceMode === 'path') {
            prompt += `\n\n### 📎 Referenced Files Handling
When you see "📎 Referenced Files" in the user's message, those are file paths that the user wants you to consider.
**Important**: The file contents are NOT included in the message. You MUST use the \`readFile\` tool to read each file before you can work with it.

Example workflow:
1. User mentions: "📎 Referenced Files: Chapters/第1回.md"
2. You should: Call readFile("Chapters/第1回.md") to read the content
3. Then: Process the content according to user's request

Always read referenced files first before attempting to work with them.`;
        }
        
        return prompt;
    }

    async getProjectFileTree(): Promise<string> {
        const folders = this.settings.folders;
        const folderKeys: (keyof typeof folders)[] = ['chapters', 'characters', 'outlines', 'notes', 'knowledge'];
        const allFiles = new Set<string>();
        
        console.log(`[AIService] Building file tree from folders:`, folders);
        
        for (const key of folderKeys) {
            const folderPath = folders[key];
            if (folderPath) {
                try {
                    const files = await this.fs.listFilesRecursive(folderPath);
                    console.log(`[AIService] Folder "${key}" (${folderPath}): found ${files.length} files`);
                    files.forEach(f => allFiles.add(f));
                } catch (e) {
                    console.warn(`[AIService] Failed to read folder "${key}" (${folderPath}):`, e);
                }
            } else {
                console.warn(`[AIService] Folder "${key}" is not configured (empty path)`);
            }
        }
        
        console.log(`[AIService] Total unique files collected: ${allFiles.size}`);
        
        const tree = this.generateFileTree(Array.from(allFiles));
        
        if (tree.length === 0) {
            console.warn(`[AIService] File tree is EMPTY. No files found in configured folders.`);
        }
        
        return tree;
    }

    private generateFileTree(files: string[]): string {
        interface TreeNode {
            isFile: boolean;
            children: { [name: string]: TreeNode };
        }
        
        const root: TreeNode = { isFile: false, children: {} };
        
        for (const path of files) {
            const parts = path.split('/');
            let current = root;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (part) { // Check if part is valid
                    if (!current.children[part]) {
                        current.children[part] = {
                            isFile: i === parts.length - 1,
                            children: {}
                        };
                    }
                    current = current.children[part];
                }
            }
        }
        
        const printTree = (node: TreeNode, prefix: string = ""): string => {
            let output = "";
            const keys = Object.keys(node.children).sort((a, b) => a.localeCompare(b));
            
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (key) { // Check if key is valid
                    const child = node.children[key];
                    if (child) {
                        const isLast = i === keys.length - 1;
                        const connector = isLast ? "└── " : "├── ";
                        
                        output += `${prefix}${connector}${key}\n`;
                        
                        const childPrefix = prefix + (isLast ? "    " : "│   ");
                        if (!child.isFile) {
                             output += printTree(child, childPrefix);
                        }
                    }
                }
            }
            return output;
        };
        
        if (files.length === 0) return "";
        return ".\n" + printTree(root);
    }

    clearSession(sessionId: string) {
        if (this.activeChats.has(sessionId)) {
            this.activeChats.delete(sessionId);
            console.log(`[Server Mode] Explicitly cleared remote LLM context for session: ${sessionId}`);
        }
    }

    private isChapterFile(filePath: string): boolean {
        // 判断文件是否在章节目录中
        const chaptersFolder = this.settings.folders?.chapters || "Chapters";
        return filePath.startsWith(chaptersFolder + "/") || filePath.startsWith(chaptersFolder + "\\");
    }

    private async performPostCheckAndRefine(
        filePath: string,
        originalContent: string,
        abortSignal?: AbortSignal
    ): Promise<{ checkResult: string, refinedContent: string | null }> {
        // 检查后置检查是否启用
        if (!this.settings.enablePostCheck) {
            console.log('[PostCheck] Post-check is disabled in settings');
            return { checkResult: "", refinedContent: null };
        }
        
        if (!this.settings.postCheckItems || this.settings.postCheckItems.length === 0) {
            return { checkResult: "", refinedContent: null };
        }

        console.log(`[PostCheck] Starting post-check for ${filePath} with ${this.settings.postCheckItems.length} check items`);

        // 构建后置检查的system prompt
        const baseSystemPrompt = this.getProcessedSystemPrompt();
        const fileTree = await this.getProjectFileTree();
        
        // 构建检查项列表
        const checkItemsList = this.settings.postCheckItems
            .map((item, index) => `${index + 1}. ${item.checkPrompt}`)
            .join('\n\n');

        const postCheckSystemPrompt = `${baseSystemPrompt}

${fileTree ? `### Project File Tree (Always Available)\n\`\`\`\n${fileTree}\n\`\`\`\n\n` : ''}

---

## 后置检查与润色任务

你现在需要对刚刚创作的内容进行后置检查和润色。

### 检查项列表
${checkItemsList}

### 工作流程

**第一步：分析检查**
仔细阅读内容，对照每一条检查项进行逐项检查。你需要：
1. 明确指出哪些地方不符合检查项的要求
2. 说明具体的问题是什么
3. 计划如何修改以满足要求

**第二步：修改润色**
在完成检查分析后，输出修改润色后的完整内容。要求：
1. 修改所有不符合检查项要求的内容
2. 保持字数不减少（可以适当增加）
3. 不删改其他符合要求的内容
4. 保持整体连贯性和流畅性

### 输出格式

请按照以下格式输出：

**【检查结果】**
（在这里输出你的检查分析结果，说明哪些地方不符合要求，准备如何修改）

**【润色后内容】**
（在这里直接输出修改润色后的完整内容，不要使用代码块包裹，直接输出markdown文本即可）

**重要提示：**
- 如果内容完全符合所有检查项，请在【检查结果】中说明"内容符合所有检查项要求，无需修改"，并在【润色后内容】中输出原内容。
- 润色后的内容必须是完整的，包含所有必要的markdown格式。
- **不要**使用\`\`\`markdown代码块包裹润色后的内容，直接输出即可。
`;

        const postCheckMessage = `请对以下内容进行后置检查和润色：

**文件路径**: ${filePath}

**原始内容**:
${originalContent}

请按照system prompt中的要求，进行检查分析并输出润色后的内容。记住，【润色后内容】部分不要使用代码块包裹，直接输出markdown文本。`;

        // 创建临时会话进行后置检查
        const tempSessionId = `postcheck-${Date.now()}`;
        
        try {
            // 使用新的GenAI client进行独立的检查会话
            if (!this.genAI) {
                throw new Error("AI client not initialized");
            }

            const chat = this.genAI.chats.create({
                model: this.settings.model || "gemini-2.0-flash",
                config: {
                    systemInstruction: postCheckSystemPrompt,
                    tools: [], // 后置检查不需要工具
                },
                history: []
            });

            const stream = await chat.sendMessageStream({ message: postCheckMessage });
            
            let fullResponse = "";
            for await (const chunk of stream) {
                if (abortSignal?.aborted) {
                    throw new Error("Post-check aborted");
                }
                
                const text = chunk.text;
                if (text) {
                    fullResponse += text;
                }
            }

            console.log(`[PostCheck] Received response, length: ${fullResponse.length}`);

            // 提取检查结果和润色后的内容
            const checkResult = this.extractCheckResult(fullResponse);
            const refinedContent = this.extractRefinedContent(fullResponse, originalContent);
            
            return { checkResult, refinedContent };
        } catch (error: any) {
            console.error("[PostCheck] Error during post-check:", error);
            throw error;
        }
    }

    private extractCheckResult(response: string): string {
        // 提取【检查结果】部分
        const checkResultMatch = response.match(/【检查结果】\s*([\s\S]*?)(?:【润色后内容】|$)/);
        if (checkResultMatch && checkResultMatch[1]) {
            return checkResultMatch[1].trim();
        }
        
        // 如果没有找到标记，尝试提取第一部分内容（在第一个代码块之前）
        const beforeCodeBlock = response.split(/```/)[0];
        if (beforeCodeBlock && beforeCodeBlock.trim().length > 10) {
            return beforeCodeBlock.trim();
        }
        
        return "正在进行后置检查...";
    }

    private extractRefinedContent(response: string, fallback: string): string {
        // 尝试从响应中提取【润色后内容】部分
        
        // 方法1: 查找【润色后内容】标记
        const refinedSectionMatch = response.match(/【润色后内容】\s*([\s\S]*)/);
        if (refinedSectionMatch && refinedSectionMatch[1]) {
            let content = refinedSectionMatch[1].trim();
            
            // 移除可能的markdown代码块包裹
            // 匹配 ```markdown 或 ``` 开头的代码块
            const codeBlockMatch = content.match(/^```(?:markdown)?\s*\n([\s\S]*?)\n```\s*$/);
            if (codeBlockMatch && codeBlockMatch[1]) {
                console.log("[PostCheck] Extracted content from markdown code block");
                return codeBlockMatch[1].trim();
            }
            
            // 如果代码块在中间位置（可能有其他文字）
            const codeBlockInMiddle = content.match(/```(?:markdown)?\s*\n([\s\S]*?)\n```/);
            if (codeBlockInMiddle && codeBlockInMiddle[1]) {
                const extracted = codeBlockInMiddle[1].trim();
                // 验证提取的内容看起来像是完整的文章内容（包含markdown标题等）
                if (extracted.includes('#') || extracted.length > 100) {
                    console.log("[PostCheck] Extracted content from code block in middle");
                    return extracted;
                }
            }
            
            // 如果没有代码块包裹，直接返回内容
            // 但需要清理可能存在的单独的```标记
            content = content.replace(/^```(?:markdown)?\s*\n?/, '').replace(/\n?```\s*$/, '');
            
            // 如果内容看起来合理（不是很短的解释文字），直接返回
            if (content.length > 50) {
                console.log("[PostCheck] Using content directly without code block");
                return content;
            }
        }
        
        // 方法2: 查找最后一个markdown代码块（作为后备方案）
        const allCodeBlocks = response.match(/```(?:markdown)?\s*\n([\s\S]*?)\n```/g);
        if (allCodeBlocks && allCodeBlocks.length > 0) {
            const lastBlock = allCodeBlocks[allCodeBlocks.length - 1];
            if (lastBlock) {
                const match = lastBlock.match(/```(?:markdown)?\s*\n([\s\S]*?)\n```/);
                if (match && match[1] && match[1].trim().length > 50) {
                    console.log("[PostCheck] Using last code block as fallback");
                    return match[1].trim();
                }
            }
        }
        
        // 方法3: 如果响应中包含"无需修改"或"符合要求"，返回原内容
        if (response.includes('无需修改') || response.includes('符合所有检查项') || response.includes('符合要求')) {
            console.log("[PostCheck] Content meets all requirements, no changes needed");
            return fallback;
        }
        
        // 如果都失败了，返回原内容
        console.warn("[PostCheck] Failed to extract refined content, returning original");
        return fallback;
    }

    async *streamChat(sessionId: string, history: Content[], newMessage: string, referencedFiles: string[] = [], abortSignal?: AbortSignal, systemInstructionOverride?: string): AsyncGenerator<any, void, unknown> {
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

        // Prepare System Prompt and File Tree
        const baseSystemPrompt = systemInstructionOverride || this.getProcessedSystemPrompt();
        const fileTree = await this.getProjectFileTree();
        const fullSystemPrompt = baseSystemPrompt + (fileTree ? `\n\n### Project File Tree (Always Available)\n\`\`\`\n${fileTree}\n\`\`\`\n` : "");
        
        console.log(`[AIService] File tree generated (length: ${fileTree.length}). Full System Prompt length: ${fullSystemPrompt.length}`);

        // Prepare context based on reference mode
        let contextContent = "";
        
        if (this.settings.referenceMode === 'content') {
            // 全文引用模式：直接读取并发送文件内容
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
        } else {
            // 路径引用模式：只发送文件路径，让模型自己用 readFile 工具读取
            if (referencedFiles.length > 0) {
                contextContent = "\n📎 Referenced Files (use readFile tool to access):\n";
                for (const fileRef of referencedFiles) {
                    // 检查是否包含行数区间
                    const match = fileRef.match(/^(.+):(\d+)-(\d+)$/);
                    if (match && match[1] && match[2] && match[3]) {
                        contextContent += `- ${match[1]} (Lines ${match[2]}-${match[3]})\n`;
                    } else {
                        contextContent += `- ${fileRef}\n`;
                    }
                }
                contextContent += "\nPlease use the readFile tool to read the content of these files as needed.\n";
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
           
        let chat;

        // Check if we can reuse an existing chat session (Server Mode)
        if (this.settings.contextMode === 'server' && sessionId && this.activeChats.has(sessionId)) {
             chat = this.activeChats.get(sessionId);
             console.log(`🔄 [Server Mode] Reusing existing chat for session: ${sessionId}`);
        } else {
            // WYSIWYG Mode OR New Server Session: Initialize chat
            
            let cleanHistory: Content[];
            
            if (this.settings.contextMode === 'server') {
                // Server Mode: Start with EMPTY history, let SDK maintain context from now on
                cleanHistory = [];
                console.log(`🆕 [Server Mode] Creating new chat with EMPTY history for session: ${sessionId}`);
            } else {
                // WYSIWYG Mode: Use provided history to sync with UI
                console.log(`📋 [WYSIWYG Mode] Processing history with length: ${history.length}`);
           
        // Use SDK's ChatSession to manage history and state automatically.
        // This is CRITICAL for Thinking models to preserve 'thought_signature' in history.
        // We initialize with the PREVIOUS history (not including current turn).
        // Filter history to ensure only valid roles are passed
        const validRoles = ['user', 'model'];
                cleanHistory = history.filter(h => h.role && validRoles.includes(h.role));
        
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

                console.log(`✅ [WYSIWYG Mode] Clean history length: ${cleanHistory.length}`);
            }

        // Create chat using new SDK
            chat = this.genAI.chats.create({
            model: this.settings.model || "gemini-2.0-flash", // Ensure string
            config: {
                    systemInstruction: fullSystemPrompt,
                tools: tools,
            },
            history: cleanHistory
        });

            if (this.settings.contextMode === 'server' && sessionId) {
                 this.activeChats.set(sessionId, chat);
                 console.log(`💾 [Server Mode] Saved chat to activeChats for session: ${sessionId}`);
            }
        }

        // Construct current user message
        let msgToSend: Part[] | string = contextContent ? `${contextContent}\n\nUser Query: ${newMessage}` : newMessage;
        
        console.log('Final message to send (truncated):', typeof msgToSend === 'string' ? msgToSend.substring(0, 500) + '...' : 'Part[] content');

        // Yield debug info
        yield { 
            type: "debug_info", 
            debugData: {
                systemInstruction: fullSystemPrompt,
                userMessage: msgToSend
            }
        };

        // Loop for tool calls
        while (true) {
            if (abortSignal?.aborted) {
                yield { type: "error", content: "生成已取消" };
                return;
            }

            let stream;
            try {
                console.log('Sending message to Gemini API, model:', this.settings.model);
                // Note: The @google/genai SDK stream method might not directly accept AbortSignal in options yet?
                // But we can check abort status in the loop.
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
                     if (abortSignal?.aborted) {
                         yield { type: "error", content: "生成已取消" };
                         return;
                     }
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
                     let undoData: { previousContent: string | null, path: string } | undefined;

                     try {
                        if (name === "writeFile") {
                            // Capture previous content for undo
                            const previousContent = await this.fs.writeFile(toolArgs.path, toolArgs.content);
                            output = `File ${toolArgs.path} written successfully.`;
                            undoData = {
                                previousContent: previousContent,
                                path: toolArgs.path
                            };
                            
                            // 立即yield第一次writeFile的结果（中间版本）
                            yield { type: "tool_result", tool: name, result: output, args: toolArgs, undoData: undoData };
                            
                            // 检查是否是章节文件，如果是则触发后置检查和润色
                            const isChapterFile = this.isChapterFile(toolArgs.path);
                            if (isChapterFile && this.settings.postCheckItems && this.settings.postCheckItems.length > 0) {
                                yield { type: "thinking", content: "正在进行后置检查和润色..." };
                                
                                try {
                                    const { checkResult, refinedContent } = await this.performPostCheckAndRefine(
                                        toolArgs.path,
                                        toolArgs.content,
                                        abortSignal
                                    );
                                    
                                    // 展示检查结果
                                    if (checkResult) {
                                        yield { type: "thinking", content: `后置检查结果：\n\n${checkResult}` };
                                    }
                                    
                                    if (refinedContent && refinedContent !== toolArgs.content) {
                                        // 应用润色后的内容
                                        await this.fs.writeFile(toolArgs.path, refinedContent);
                                        const refinedOutput = `File ${toolArgs.path} refined and updated.`;
                                        
                                        // yield第二次writeFile的结果（润色后版本）
                                        yield { 
                                            type: "tool_result", 
                                            tool: "writeFile", 
                                            result: refinedOutput, 
                                            args: { path: toolArgs.path, content: refinedContent }, 
                                            undoData: { previousContent: toolArgs.content, path: toolArgs.path }
                                        };
                                        
                                        yield { type: "thinking", content: "后置检查和润色已完成" };
                                        
                                        // 跳过后续的tool_result yield（因为已经yield过了）
                                        functionResponses.push({
                                            functionResponse: {
                                                name: name,
                                                response: { result: refinedOutput }
                                            }
                                        });
                                        continue;
                                    } else {
                                        yield { type: "thinking", content: "后置检查完成，内容符合要求，无需修改" };
                                    }
                                } catch (refineError: any) {
                                    console.error("Post-check refinement error:", refineError);
                                    yield { type: "thinking", content: `后置检查出错: ${refineError.message}` };
                                }
                            }
                            
                            // 跳过后续的tool_result yield（因为已经yield过了）
                            functionResponses.push({
                                functionResponse: {
                                    name: name,
                                    response: { result: output }
                                }
                            });
                            continue;
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
                     
                     yield { type: "tool_result", tool: name, result: output, args: toolArgs, undoData: undoData };
                     
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
