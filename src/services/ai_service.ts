import { GoogleGenAI, Content, Part, Tool, Type } from "@google/genai";
import { FSService } from "./fs_service";
import { VoyaruSettings, DEFAULT_SETTINGS, ProviderConfig } from "../settings";
import { Notice } from "obsidian";
import { PromptService } from "./prompt_service";

export class AIService {
    private genAI: GoogleGenAI | null = null;
    private fs: FSService;
    private settings: VoyaruSettings;
    private activeChats: Map<string, any> = new Map();
    private promptService: PromptService;

    constructor(settings: VoyaruSettings, fs: FSService, promptService: PromptService) {
        this.settings = settings;
        this.fs = fs;
        this.promptService = promptService;
        this.initClient();
    }

    initClient() {
         const provider = this.getActiveProvider();
         if (!provider || !provider.apiKey || provider.apiKey.trim().length === 0) {
             console.log('[AIService] No active provider or API key is empty');
             this.genAI = null;
             return;
         }

         // 目前只支持 Gemini，其他提供商的完整支持需要进一步重构
         if (provider.type !== 'gemini') {
             console.warn(`[AIService] Provider type "${provider.type}" is not fully supported yet. Please use Gemini.`);
             this.genAI = null;
             return;
         }

         try {
             const clientConfig: any = {
                 apiKey: provider.apiKey.trim()
             };

             if (provider.baseURL) {
                 clientConfig.baseURL = provider.baseURL;
             }

             this.genAI = new GoogleGenAI(clientConfig);
             console.log(`[AIService] Initialized ${provider.name} successfully`);
         } catch (e) {
             console.error('[AIService] Failed to initialize AI client:', e);
             this.genAI = null;
         }
    }

    private getActiveProvider(): ProviderConfig | null {
        if (!this.settings.activeProviderId) {
            // 向后兼容：如果有旧的 apiKey，尝试使用它
            if (this.settings.apiKey) {
                return {
                    id: 'legacy',
                    type: 'gemini',
                    name: 'Gemini (Legacy)',
                    apiKey: this.settings.apiKey,
                    selectedModel: this.settings.model || 'gemini-3-pro-preview'
                };
            }
            return null;
        }
        return this.settings.providers?.find(p => p.id === this.settings.activeProviderId) || null;
    }

    private getCurrentModel(): string {
        const provider = this.getActiveProvider();
        return provider?.selectedModel || 'gemini-2.0-flash';
    }
    
    async updateSettings(settings: VoyaruSettings) {
        const oldProviderId = this.settings.activeProviderId;
        const oldProvider = this.getActiveProvider();

        this.settings = settings;
        const newProvider = this.getActiveProvider();

        // 检查是否需要重新初始化客户端
        const needsReinit =
            oldProviderId !== settings.activeProviderId ||
            oldProvider?.apiKey !== newProvider?.apiKey ||
            oldProvider?.selectedModel !== newProvider?.selectedModel ||
            oldProvider?.type !== newProvider?.type ||
            oldProvider?.baseURL !== newProvider?.baseURL;

        if (needsReinit) {
            console.log('[AIService] Provider configuration changed, re-initializing');
            this.initClient();
        }
    }

    /**
     * 获取处理后的系统提示词 (分层架构)
     * 组成: 核心系统指令 (不可编辑) + 用户自定义部分 (可编辑)
     */
    getProcessedSystemPrompt(): string {
        // 第一部分: 核心系统指令 (始终从 prompts.json 加载,确保工具指导不丢失)
        let coreInstructions = this.promptService.getSystemPrompt(false);

        // 应用文件夹占位符替换
        const folders = this.settings.folders;
        if (folders) {
            coreInstructions = coreInstructions.replace(/\{chapters\}/g, folders.chapters || "Chapters");
            coreInstructions = coreInstructions.replace(/\{characters\}/g, folders.characters || "Characters");
            coreInstructions = coreInstructions.replace(/\{outlines\}/g, folders.outlines || "Outlines");
            coreInstructions = coreInstructions.replace(/\{notes\}/g, folders.notes || "Notes");
            coreInstructions = coreInstructions.replace(/\{knowledge\}/g, folders.knowledge || "Knowledge");
        }

        // 第二部分: 用户自定义部分
        let customPart = this.settings.customPrompt || '';
        if (customPart.trim().length > 0) {
            // 添加分隔符,清晰标识用户自定义内容
            customPart = '\n\n---\n\n### 用户自定义规则\n\n' + customPart;
        }

        // 组合最终提示词
        let finalPrompt = coreInstructions + customPart;

        // 根据引用模式添加额外说明
        if (this.settings.referenceMode === 'path') {
            finalPrompt += this.promptService.getReferenceModeInstruction();
        }

        return finalPrompt;
    }

    /**
     * 尝试查找用户配置的知识库或笔记目录中的风格指南文件路径
     * @returns 风格指南文件路径，如果不存在则返回 null
     */
    async findStyleGuidePath(): Promise<string | null> {
        // 兼容有无 .md 后缀的文件名（Obsidian 中不显示 .md）
        const styleGuideFileNames = ["风格指南.md", "风格指南"];
        const folders = this.settings.folders;
        
        // 按优先级尝试查找用户配置的目录：知识库目录 > 笔记目录
        // folders.knowledge 和 folders.notes 是用户在插件设置中配置的实际目录路径
        const searchPaths: string[] = [];
        for (const folder of [folders?.knowledge, folders?.notes]) {
            if (folder) {
                for (const fileName of styleGuideFileNames) {
                    searchPaths.push(`${folder}/${fileName}`);
                }
            }
        }
        
        for (const path of searchPaths) {
            try {
                const content = await this.fs.readFile(path);
                if (content && content.trim().length > 0) {
                    console.log(`[AIService] Found style guide at: ${path}`);
                    return path;
                }
            } catch (e) {
                // 文件不存在，继续尝试下一个路径
            }
        }
        
        console.log(`[AIService] No style guide found in configured knowledge or notes folders`);
        return null;
    }

    /**
     * 获取完整的 system prompt（包含风格指南引用指令）
     */
    async getFullSystemPrompt(): Promise<string> {
        let prompt = this.getProcessedSystemPrompt();

        // 查找风格指南文件路径
        const styleGuidePath = await this.findStyleGuidePath();
        if (styleGuidePath) {
            prompt += '\n\n' + this.promptService.getStyleGuideInstruction(styleGuidePath);
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

        // 构建后置检查的system prompt（包含风格指南）
        const baseSystemPrompt = await this.getFullSystemPrompt();
        const fileTree = await this.getProjectFileTree();

        // 使用 PromptService 获取后置检查提示词
        const postCheckSystemPrompt = this.promptService.getPostCheckSystemPrompt(
            baseSystemPrompt,
            fileTree || '',
            this.settings.postCheckItems
        );

        const postCheckMessage = this.promptService.getPostCheckUserMessage(
            filePath,
            originalContent
        );

        // 创建临时会话进行后置检查
        const tempSessionId = `postcheck-${Date.now()}`;
        
        try {
            // 使用新的GenAI client进行独立的检查会话
            if (!this.genAI) {
                throw new Error("AI client not initialized");
            }

            const chat = this.genAI.chats.create({
                model: this.getCurrentModel(),
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
            console.log(`[PostCheck] Original content length: ${originalContent.length}`);
            console.log(`[PostCheck] Full response preview:`, fullResponse.substring(0, 500));

            // 提取检查结果和润色后的内容
            const checkResult = this.extractCheckResult(fullResponse);
            const refinedContent = this.extractRefinedContent(fullResponse, originalContent);
            
            console.log(`[PostCheck] Extracted content length: ${refinedContent.length}`);
            
            // 内容丢失检测：如果提取的内容比原内容短太多，返回原内容
            const contentLossThreshold = 0.5; // 如果内容少于原来的50%，认为可能出错了
            if (refinedContent.length < originalContent.length * contentLossThreshold) {
                console.warn(`[PostCheck] Content loss detected! Original: ${originalContent.length}, Extracted: ${refinedContent.length}. Returning original content.`);
                return { checkResult, refinedContent: null };
            }
            
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
        console.log("[PostCheck] Starting content extraction...");
        
        // 方法1: 查找【润色后内容】标记
        const refinedSectionMatch = response.match(/【润色后内容】\s*([\s\S]*)/);
        if (refinedSectionMatch && refinedSectionMatch[1]) {
            let content = refinedSectionMatch[1].trim();
            console.log(`[PostCheck] Found 【润色后内容】 section, length: ${content.length}`);
            console.log(`[PostCheck] Section preview: ${content.substring(0, 200)}`);
            
            // 检查是否有代码块标记（不区分大小写）
            const hasCodeBlock = /```/i.test(content);
            
            if (hasCodeBlock) {
                console.log("[PostCheck] Code block markers found, attempting to extract...");
                
                // 尝试匹配完整的代码块（不区分大小写的markdown）
                const codeBlockMatch = content.match(/```(?:markdown|Markdown)?\s*\n([\s\S]*?)\n```/i);
                if (codeBlockMatch && codeBlockMatch[1]) {
                    const extracted = codeBlockMatch[1].trim();
                    console.log(`[PostCheck] Extracted from code block, length: ${extracted.length}`);
                    
                    // 验证提取的内容
                    if (extracted.length > fallback.length * 0.3) { // 至少是原内容的30%
                        return extracted;
                    } else {
                        console.warn(`[PostCheck] Extracted content too short (${extracted.length} vs ${fallback.length}), using fallback`);
                        return fallback;
                    }
                }
                
                // 如果上面失败，尝试更宽松的匹配：从第一个```到最后一个```
                const firstBacktick = content.indexOf('```');
                const lastBacktick = content.lastIndexOf('```');
                if (firstBacktick !== -1 && lastBacktick !== -1 && lastBacktick > firstBacktick) {
                    // 提取两个```之间的内容
                    let extracted = content.substring(firstBacktick, lastBacktick + 3);
                    // 移除开头的```markdown或```Markdown或```
                    extracted = extracted.replace(/^```(?:markdown|Markdown)?\s*\n?/i, '');
                    // 移除结尾的```
                    extracted = extracted.replace(/\n?```\s*$/, '');
                    extracted = extracted.trim();
                    
                    console.log(`[PostCheck] Extracted between backticks, length: ${extracted.length}`);
                    
                    if (extracted.length > fallback.length * 0.3) {
                        return extracted;
                    } else {
                        console.warn(`[PostCheck] Extracted content too short, using fallback`);
                        return fallback;
                    }
                }
                
                console.warn("[PostCheck] Found code block markers but failed to extract content properly");
            }
            
            // 没有代码块标记，直接使用内容
            // 先清理可能存在的独立的```标记
            content = content.replace(/^```(?:markdown|Markdown)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
            
            console.log(`[PostCheck] No code blocks, using content directly, length: ${content.length}`);
            
            if (content.length > fallback.length * 0.3) {
                return content;
            }
        }
        
        // 方法2: 如果响应中包含"无需修改"或"符合要求"，返回原内容
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
        // 检查API Key（使用provider而不是旧的settings.apiKey）
        const provider = this.getActiveProvider();
        const trimmedKey = provider?.apiKey?.trim();

        if (!provider || !trimmedKey || trimmedKey.length === 0) {
            new Notice("请先在设置中配置提供商和 API Key。");
            yield { type: "error", content: "API Key 未设置。请前往 设置 → Voyaru Agent → 提供商管理 配置 API Key。" };
            return;
        }

        // 如果genAI未初始化，重新初始化
        if (!this.genAI) {
            console.log('[AIService] Reinitializing AI client with provider:', provider.name);
            this.initClient();
        }

        // 再次检查（初始化后）
        if (!this.genAI) {
            new Notice("API Key 无效或提供商配置错误，请检查设置。");
            yield { type: "error", content: `初始化失败。提供商: ${provider.name}，API Key: ${trimmedKey ? '***' + trimmedKey.slice(-4) : '空'}。请检查配置是否正确。` };
            return;
        }

        // Prepare System Prompt and File Tree
        const baseSystemPrompt = systemInstructionOverride || await this.getFullSystemPrompt();
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
        // Load function declarations from PromptService
        const functionDeclarations = this.promptService.getAllToolDefinitions();

        // Filter out editFile if disabled in settings
        const filteredDeclarations = this.settings.enableEditFileTool
            ? functionDeclarations
            : functionDeclarations.filter(fd => fd.name !== 'editFile');

        const tools: Tool[] = [
            {
                functionDeclarations: filteredDeclarations
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
            model: this.getCurrentModel(),
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
                console.log('Sending message to Gemini API, model:', this.getCurrentModel());
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

            // Helper to create tool result with status tracking
            const createToolResult = (tool: string, result: any, args: any, undoData?: any, status: 'completed' | 'failed' = 'completed') => {
                const now = Date.now();
                return {
                    role: 'model' as const,
                    type: "tool_result" as const,
                    tool,
                    content: `${tool} completed`,
                    toolData: {
                        result,
                        args,
                        undoData
                    },
                    id: `tool-${tool}-${now}`,
                    status,
                    startTime: now,
                    endTime: now,
                    expanded: false
                };
            };
            
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
                             // 立即 yield 工具调用开始信息，包含参数
                             yield {
                                 type: "tool_call_start",
                                 tool: call.name,
                                 args: call.args
                             };
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
                            // 智能修正文件名：如果模型尝试写入 "Untitled"，尝试从内容中提取标题
                            let targetPath = toolArgs.path;
                            const fileName = targetPath.split('/').pop() || "";
                            
                            if (fileName.toLowerCase().startsWith("untitled")) {
                                // 尝试从内容第一行提取标题 (# 第X回 标题)
                                const firstLine = toolArgs.content.trim().split('\n')[0] || "";
                                const match = firstLine.match(/^#\s*(第.+回\s+.+)$/);
                                if (match && match[1]) {
                                    // 保留原目录，替换文件名
                                    const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
                                    const newName = match[1].trim() + ".md"; // 确保有.md后缀
                                    targetPath = dir ? `${dir}/${newName}` : newName;
                                    console.log(`[SmartRename] Renamed ${toolArgs.path} to ${targetPath} based on content title.`);
                                }
                            }

                            // Capture previous content for undo
                            const previousContent = await this.fs.writeFile(targetPath, toolArgs.content);
                            output = `File ${targetPath} written successfully.`;
                            undoData = {
                                previousContent: previousContent,
                                path: targetPath
                            };
                            
                            // 立即yield第一次writeFile的结果（中间版本）
                            const updatedArgs = { ...toolArgs, path: targetPath };
                            yield createToolResult(name, output, updatedArgs, undoData);
                            
                            // 检查是否是章节文件，如果是则触发后置检查和润色
                            const isChapterFile = this.isChapterFile(targetPath);
                            if (isChapterFile && this.settings.enablePostCheck && this.settings.postCheckItems && this.settings.postCheckItems.length > 0) {
                                // Yield tool_call_start for post-check
                                yield {
                                    type: "tool_call_start",
                                    tool: "postCheck",
                                    args: { filePath: targetPath }
                                };

                                try {
                                    const { checkResult, refinedContent } = await this.performPostCheckAndRefine(
                                        targetPath,
                                        toolArgs.content,
                                        abortSignal
                                    );

                                    // 展示检查结果
                                    if (checkResult) {
                                        yield { type: "thinking", content: `后置检查结果：\n\n${checkResult}` };
                                    }
                                    
                                    if (refinedContent && refinedContent !== toolArgs.content) {
                                        // 应用润色后的内容
                                        await this.fs.writeFile(targetPath, refinedContent);
                                        const refinedOutput = `File ${targetPath} refined and updated.`;

                                        // yield第二次writeFile的结果（润色后版本）
                                        yield createToolResult("writeFile", refinedOutput, { path: targetPath, content: refinedContent }, { previousContent: toolArgs.content, path: targetPath });

                                        // Yield tool_result for post-check (completed with refinement)
                                        yield {
                                            type: "tool_result",
                                            tool: "postCheck",
                                            args: { filePath: targetPath },
                                            result: `Content refined (${refinedContent.length} chars). Check result: ${checkResult || 'Passed'}`
                                        };

                                        // 跳过后续的tool_result yield（因为已经yield过了）
                                        functionResponses.push({
                                            functionResponse: {
                                                name: name,
                                                response: { result: refinedOutput }
                                            }
                                        });
                                        continue;
                                    } else {
                                        // Yield tool_result for post-check (completed without changes)
                                        yield {
                                            type: "tool_result",
                                            tool: "postCheck",
                                            args: { filePath: targetPath },
                                            result: `Content meets all requirements. Check result: ${checkResult || 'Passed'}`
                                        };
                                    }
                                } catch (refineError: any) {
                                    console.error("Post-check refinement error:", refineError);
                                    // Yield tool_result for post-check (failed)
                                    yield {
                                        type: "tool_result",
                                        tool: "postCheck",
                                        args: { filePath: targetPath },
                                        result: `Post-check failed: ${refineError.message}`,
                                        error: true
                                    };
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
                        } else if (name === "editFile") {
                            // Check if editFile is enabled in settings
                            if (!this.settings.enableEditFileTool) {
                                output = "Error: editFile tool is disabled in settings. Please use writeFile instead or enable editFile in settings.";
                                yield createToolResult(name, output, toolArgs);
                                functionResponses.push({
                                    functionResponse: {
                                        name: name,
                                        response: { result: output }
                                    }
                                });
                                continue;
                            }

                            // Validate operation parameter
                            const operation = toolArgs.operation;
                            const validOps = ['replace', 'insert', 'delete', 'append'];

                            if (!validOps.includes(operation)) {
                                output = `Error: Invalid operation "${operation}". Must be one of: ${validOps.join(', ')}`;
                                yield createToolResult(name, output, toolArgs);
                                functionResponses.push({
                                    functionResponse: {
                                        name: name,
                                        response: { result: output }
                                    }
                                });
                                continue;
                            }

                            try {
                                // Perform edit operation
                                const previousContent = await this.fs.editFile(
                                    toolArgs.path,
                                    operation,
                                    toolArgs.startLine,
                                    toolArgs.endLine,
                                    toolArgs.content
                                );

                                // Build success message with operation details
                                let operationDesc = '';
                                switch (operation) {
                                    case 'replace':
                                        operationDesc = `Replaced lines ${toolArgs.startLine}-${toolArgs.endLine}`;
                                        break;
                                    case 'insert':
                                        operationDesc = `Inserted content after line ${toolArgs.startLine}`;
                                        break;
                                    case 'delete':
                                        operationDesc = `Deleted lines ${toolArgs.startLine}-${toolArgs.endLine}`;
                                        break;
                                    case 'append':
                                        operationDesc = `Appended content to end of file`;
                                        break;
                                }

                                output = `File ${toolArgs.path} edited successfully. ${operationDesc}`;
                                undoData = {
                                    previousContent: previousContent,
                                    path: toolArgs.path
                                };

                                // Yield result with undo data
                                yield createToolResult(name, output, toolArgs, undoData);

                                // Post-check logic: Only trigger for replace/append operations on chapter files
                                const isChapterFile = this.isChapterFile(toolArgs.path);
                                const shouldPostCheck = (operation === 'replace' || operation === 'append');

                                if (isChapterFile && shouldPostCheck && this.settings.enablePostCheck &&
                                    this.settings.postCheckItems && this.settings.postCheckItems.length > 0) {

                                    // Read updated file content for post-check
                                    const updatedContent = await this.fs.readFile(toolArgs.path);

                                    // Yield tool_call_start for post-check
                                    yield {
                                        type: "tool_call_start",
                                        tool: "postCheck",
                                        args: { filePath: toolArgs.path }
                                    };

                                    try {
                                        const { checkResult, refinedContent } = await this.performPostCheckAndRefine(
                                            toolArgs.path,
                                            updatedContent,
                                            abortSignal
                                        );

                                        if (checkResult) {
                                            yield { type: "thinking", content: `后置检查结果:\n\n${checkResult}` };
                                        }

                                        if (refinedContent && refinedContent !== updatedContent) {
                                            // Apply refined content (full rewrite after check)
                                            await this.fs.writeFile(toolArgs.path, refinedContent);

                                            yield createToolResult("writeFile", `File ${toolArgs.path} refined after post-check`, { path: toolArgs.path, content: refinedContent }, { previousContent: updatedContent, path: toolArgs.path });

                                            // Yield tool_result for post-check (completed with refinement)
                                            yield {
                                                type: "tool_result",
                                                tool: "postCheck",
                                                args: { filePath: toolArgs.path },
                                                result: `Content refined (${refinedContent.length} chars). Check result: ${checkResult || 'Passed'}`
                                            };
                                        } else {
                                            // Yield tool_result for post-check (completed without changes)
                                            yield {
                                                type: "tool_result",
                                                tool: "postCheck",
                                                args: { filePath: toolArgs.path },
                                                result: `Content meets all requirements. Check result: ${checkResult || 'Passed'}`
                                            };
                                        }
                                    } catch (refineError: any) {
                                        console.error("Post-check refinement error:", refineError);
                                        // Yield tool_result for post-check (failed)
                                        yield {
                                            type: "tool_result",
                                            tool: "postCheck",
                                            args: { filePath: toolArgs.path },
                                            result: `Post-check failed: ${refineError.message}`,
                                            error: true
                                        };
                                    }
                                }

                                functionResponses.push({
                                    functionResponse: {
                                        name: name,
                                        response: { result: output }
                                    }
                                });
                                continue;

                            } catch (e: any) {
                                output = `Error executing editFile: ${e.message}`;
                            }
                        } else {
                            output = "Unknown tool.";
                        }
                     } catch (e: any) {
                         output = `Error executing ${name}: ${e.message}`;
                     }
                     
                     yield createToolResult(name, output, toolArgs, undoData);
                     
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
