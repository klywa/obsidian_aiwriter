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
    private memoryIndexCache: string | null = null;

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
        // 优先使用provider的selectedModel，其次使用旧字段model，最后使用默认值
        return provider?.selectedModel || this.settings.model || 'gemini-2.0-flash';
    }

    private getModelForFeature(feature: 'memory' | 'reflection'): string {
        const value: string = feature === 'memory'
            ? this.settings.memoryExtractionModel
            : this.settings.writerReflectionModel;
        if (!value || value === 'follow') return this.getCurrentModel();
        return value;
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

        // Core writing behavior rules (always applied, not shown in settings UI)
        finalPrompt += this.promptService.getWritingRules();

        return finalPrompt;
    }

    /**
     * 读取 vault 根目录下的 WRITER.md 内容
     * @returns 文件内容，如果不存在则返回 null
     */
    async readWriterMd(): Promise<string | null> {
        for (const name of ['WRITER.md', 'WRITER']) {
            try {
                const content = await this.fs.readFile(name);
                if (content && content.trim().length > 0) {
                    console.log(`[AIService] Found WRITER.md (${content.length} chars)`);
                    return content;
                }
            } catch (e) {
                // 文件不存在，继续尝试下一个
            }
        }
        console.log('[AIService] No WRITER.md found in vault root');
        return null;
    }

    /**
     * 获取完整的 system prompt（包含 WRITER.md 内容）
     */
    async getFullSystemPrompt(): Promise<string> {
        let prompt = this.getProcessedSystemPrompt();

        // 读取 WRITER.md 并直接拼入系统 prompt
        const writerMd = await this.readWriterMd();
        if (writerMd) {
            prompt += '\n\n---\n\n## WRITER.md（用户写作指南）\n\n' + writerMd;
        }

        // 注入记忆系统索引（在 WRITER.md 之后、文件树之前）
        if (this.settings.enableMemory) {
            try {
                const memoryIndex = await this.buildMemoryIndex();
                if (memoryIndex) {
                    prompt += '\n\n---\n\n' + this.promptService.getMemoryModeInstruction(memoryIndex);
                }
            } catch (e) {
                console.warn('[Memory] Failed to build memory index for system prompt:', e);
            }
        }

        return prompt;
    }

    /**
     * Helper function to detect empty response from API (known bug workaround)
     * Empty responses have finishReason "STOP" but no text or function calls
     */
    private isEmptyResponse(chunk: any): boolean {
        return chunk?.finishReason === "STOP" &&
               (!chunk?.text || chunk?.text === "") &&
               (!chunk?.functionCalls || chunk?.functionCalls?.length === 0);
    }

    /**
     * Estimate token count from text (rough approximation: 1 token ≈ 4 characters)
     */
    private estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get max retry count from settings
     */
    private getMaxRetries(): number {
        return this.settings.maxRetries ?? 3;
    }

    /**
     * Get retry delay for a given attempt (exponential backoff)
     * @param attempt - The attempt number (0-based)
     * @returns Delay in milliseconds
     */
    private getRetryDelay(attempt: number): number {
        return Math.min(1000 * Math.pow(2, attempt), 8000); // Max 8 seconds
    }

    async getProjectFileTree(): Promise<string> {
        const folders = this.settings.folders;
        const folderKeys: (keyof typeof folders)[] = ['chapters', 'characters', 'outlines', 'notes', 'knowledge', 'memory', 'plan'];
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

    /**
     * Returns the path of the .plan.md file for a given chapter path.
     * e.g., "Chapters/第一回.md" → "Chapters/第一回.plan.md"
     */
    private getPlanFilePath(chapterPath: string): string {
        // Strip .plan.md if already present to prevent .plan.plan.md double suffix
        let cleanPath = chapterPath;
        if (cleanPath.endsWith('.plan.md')) {
            cleanPath = cleanPath.slice(0, -'.plan.md'.length) + '.md';
        }

        const lastSlash = Math.max(cleanPath.lastIndexOf('/'), cleanPath.lastIndexOf('\\'));
        const dir = lastSlash > -1 ? cleanPath.substring(0, lastSlash + 1) : '';
        const filename = lastSlash > -1 ? cleanPath.substring(lastSlash + 1) : cleanPath;
        const lastDot = filename.lastIndexOf('.');
        const base = lastDot > -1 ? filename.substring(0, lastDot) : filename;
        // Store in vault-root Plan/ folder to avoid confusion with chapter files
        return 'Plan/' + base + '.plan.md';
    }

    /**
     * Reads the content of a confirmed .plan.md file for a chapter.
     * Returns null if no confirmed plan exists.
     */
    private async readConfirmedPlan(chapterPath: string): Promise<string | null> {
        const planPath = this.getPlanFilePath(chapterPath);
        try {
            const content = await this.fs.readFile(planPath);
            if (content.includes('status: confirmed') || content.includes('status: executed')) {
                return content;
            }
        } catch (e) {
            // No plan file exists
        }
        return null;
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

    /**
     * Invalidate the in-memory index cache (call when Memory folder files change)
     */
    invalidateMemoryIndex(): void {
        this.memoryIndexCache = null;
        console.log('[Memory] Index cache invalidated');
    }

    /**
     * Build memory index by scanning YAML frontmatter of all memory files.
     * Result is cached until invalidated.
     */
    async buildMemoryIndex(): Promise<string> {
        if (this.memoryIndexCache !== null) {
            return this.memoryIndexCache;
        }

        const memoryFolder = this.settings.folders.memory || 'Memory';
        const categories = [
            { key: 'Characters', label: '角色 (Characters/)' },
            { key: 'Plotlines', label: '情节线 (Plotlines/)' },
            { key: 'World', label: '世界观 (World/)' },
        ];

        const sections: string[] = [];

        for (const cat of categories) {
            const folderPath = `${memoryFolder}/${cat.key}`;
            let filePaths: string[] = [];
            try {
                filePaths = await this.fs.listFilesRecursive(folderPath);
            } catch {
                // Folder may not exist yet
                continue;
            }

            const mdFiles = filePaths.filter(p => p.endsWith('.md'));
            if (mdFiles.length === 0) continue;

            const lines: string[] = [`### ${cat.label}`];
            for (const filePath of mdFiles.sort()) {
                try {
                    const content = await this.fs.readFile(filePath);
                    const summaryMatch = content.match(/^summary:\s*(.+)$/m);
                    const summary = summaryMatch ? summaryMatch[1]!.trim() : '（无摘要）';
                    lines.push(`- ${filePath}: ${summary}`);
                } catch {
                    // Skip unreadable files
                }
            }
            sections.push(lines.join('\n'));
        }

        const index = sections.length > 0 ? sections.join('\n\n') : '';
        this.memoryIndexCache = index;
        console.log(`[Memory] Index built: ${index.length} chars`);
        return index;
    }

    /**
     * Perform memory extraction from a chapter file.
     * Clones the performPostCheckAndRefine() pattern.
     */
    private async performMemoryExtraction(
        chapterPath: string,
        chapterContent: string,
        abortSignal?: AbortSignal
    ): Promise<{ updatedEntities: string[] } | null> {
        if (!this.settings.enableMemory) {
            return null;
        }

        if (!this.genAI) {
            throw new Error('AI client not initialized');
        }

        console.log(`[Memory] Starting extraction for ${chapterPath}`);

        // Build index
        const memoryIndex = await this.buildMemoryIndex();

        // Smart pre-read: find entities whose names appear in chapter content
        const memoryFolder = this.settings.folders.memory || 'Memory';
        const allEntityFiles: string[] = [];
        for (const cat of ['Characters', 'Plotlines', 'World']) {
            try {
                const files = await this.fs.listFilesRecursive(`${memoryFolder}/${cat}`);
                allEntityFiles.push(...files.filter(f => f.endsWith('.md')));
            } catch {
                // Folder may not exist
            }
        }

        const relatedParts: string[] = [];
        for (const filePath of allEntityFiles) {
            // Entity name = filename without .md
            const entityName = filePath.split('/').pop()?.replace(/\.md$/, '') || '';
            if (entityName && chapterContent.includes(entityName)) {
                try {
                    const fileContent = await this.fs.readFile(filePath);
                    relatedParts.push(`### ${filePath}\n\n${fileContent}`);
                } catch {
                    // Skip
                }
            }
        }
        const relatedEntityContents = relatedParts.length > 0
            ? relatedParts.join('\n\n---\n\n')
            : '（暂无相关实体的现有记忆文件）';

        // Build prompts
        const baseSystemPrompt = await this.getFullSystemPrompt();
        const extractionSystemPrompt = this.promptService.getMemoryExtractionSystemPrompt(baseSystemPrompt);
        const extractionUserMessage = this.promptService.getMemoryExtractionUserMessage({
            chapterPath,
            chapterContent,
            memoryIndex: memoryIndex || '（记忆索引为空，当前没有已有记忆文件）',
            relatedEntityContents
        });

        // Create temp session
        const chat = this.genAI.chats.create({
            model: this.getModelForFeature('memory'),
            config: {
                systemInstruction: extractionSystemPrompt,
                tools: [],
            },
            history: []
        });

        const stream = await chat.sendMessageStream({ message: extractionUserMessage });

        let fullResponse = '';
        for await (const chunk of stream) {
            if (abortSignal?.aborted) {
                throw new Error('Memory extraction aborted');
            }
            if (chunk.text) {
                fullResponse += chunk.text;
            }
        }

        console.log(`[Memory] Extraction response length: ${fullResponse.length}`);

        // Parse ===ENTITY=== blocks
        const entityRegex = /===ENTITY===([\s\S]*?)===CONTENT===([\s\S]*?)===END===/g;
        const updatedEntities: string[] = [];
        let match: RegExpExecArray | null;

        while ((match = entityRegex.exec(fullResponse)) !== null) {
            const metaBlock = match[1]!.trim();
            const contentBlock = match[2]!.trim();

            const categoryMatch = metaBlock.match(/^category:\s*(.+)$/m);
            const nameMatch = metaBlock.match(/^name:\s*(.+)$/m);
            const summaryMatch = metaBlock.match(/^summary:\s*(.+)$/m);

            if (!categoryMatch || !nameMatch) {
                console.warn('[Memory] Skipping entity block — missing category or name');
                continue;
            }

            const category = categoryMatch[1]!.trim().toLowerCase();
            const name = nameMatch[1]!.trim();
            const summary = summaryMatch ? summaryMatch[1]!.trim() : name;

            // Map category to subfolder
            const catFolderMap: Record<string, string> = {
                characters: 'Characters',
                plotlines: 'Plotlines',
                world: 'World'
            };
            const subFolder = catFolderMap[category];
            if (!subFolder) {
                console.warn(`[Memory] Unknown category: ${category}`);
                continue;
            }

            const filePath = `${memoryFolder}/${subFolder}/${name}.md`;
            const typeMap: Record<string, string> = {
                characters: 'character',
                plotlines: 'plotline',
                world: 'world'
            };
            const today = new Date().toISOString().split('T')[0];
            const frontmatter = `---\ntype: ${typeMap[category]}\nsummary: ${summary}\nlastUpdated: ${today}\n---\n\n`;
            const fileContent = frontmatter + contentBlock;

            await this.fs.writeFile(filePath, fileContent);
            updatedEntities.push(filePath);
            console.log(`[Memory] Written: ${filePath}`);
        }

        // Invalidate cache after updates
        this.invalidateMemoryIndex();

        return { updatedEntities };
    }

    /**
     * Full memory refresh: clear all memory files and re-extract from all chapters in order.
     */
    async performFullMemoryRefresh(
        abortSignal?: AbortSignal,
        onProgress?: (current: number, total: number) => void
    ): Promise<void> {
        if (!this.settings.enableMemory) return;

        const memoryFolder = this.settings.folders.memory || 'Memory';
        const chaptersFolder = this.settings.folders.chapters || 'Chapters';

        // Clear existing memory files
        for (const cat of ['Characters', 'Plotlines', 'World']) {
            try {
                const files = await this.fs.listFilesRecursive(`${memoryFolder}/${cat}`);
                for (const f of files.filter(fp => fp.endsWith('.md'))) {
                    await this.fs.deleteFile(f);
                }
            } catch {
                // Folder may not exist
            }
        }
        this.invalidateMemoryIndex();

        // Get all chapter files sorted
        let chapterFiles: string[] = [];
        try {
            chapterFiles = (await this.fs.listFilesRecursive(chaptersFolder))
                .filter(f => f.endsWith('.md'))
                .sort();
        } catch {
            console.warn('[Memory] Could not list chapter files for full refresh');
            return;
        }

        const total = chapterFiles.length;
        for (let i = 0; i < total; i++) {
            if (abortSignal?.aborted) break;
            const chapterPath = chapterFiles[i]!;
            onProgress?.(i + 1, total);
            try {
                const content = await this.fs.readFile(chapterPath);
                await this.performMemoryExtraction(chapterPath, content, abortSignal);
            } catch (err) {
                console.error(`[Memory] Failed to extract from ${chapterPath}:`, err);
            }
        }
    }

    /**
     * Auto-section markers used in WRITER.md for AI-managed guidelines.
     */
    private static readonly WRITER_AUTO_START = '<!-- voyaru-auto-guidelines-start -->';
    private static readonly WRITER_AUTO_END = '<!-- voyaru-auto-guidelines-end -->';

    /**
     * Reflect on a chapter modification to extract writing lessons and update WRITER.md auto section.
     * Only called for modifications (previousContent !== null), not for new file creation.
     */
    private async performWriterMdReflection(
        originalContent: string,
        modifiedContent: string,
        userInstruction: string,
        abortSignal?: AbortSignal
    ): Promise<{ updated: boolean } | null> {
        if (!this.genAI) {
            throw new Error('AI client not initialized');
        }

        console.log('[Reflection] Starting writer reflection');

        // Read existing WRITER.md and extract auto section
        const writerMdContent = await this.readWriterMd();
        let existingGuidelines = '';
        if (writerMdContent) {
            const startIdx = writerMdContent.indexOf(AIService.WRITER_AUTO_START);
            const endIdx = writerMdContent.indexOf(AIService.WRITER_AUTO_END);
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
                existingGuidelines = writerMdContent
                    .slice(startIdx + AIService.WRITER_AUTO_START.length, endIdx)
                    .trim();
            }
        }

        // Build prompts
        const basePrompt = this.getProcessedSystemPrompt();
        const systemPrompt = this.promptService.getReflectionSystemPrompt(basePrompt);
        const userMessage = this.promptService.getReflectionUserMessage({
            userInstruction,
            originalContent,
            modifiedContent,
            existingGuidelines: existingGuidelines || '（暂无）'
        });

        // Create isolated chat session for reflection
        const reflectionChat = this.genAI.chats.create({
            model: this.getModelForFeature('reflection'),
            config: {
                systemInstruction: systemPrompt,
                tools: [],
            },
            history: []
        });

        let newAutoContent = '';
        const stream = await reflectionChat.sendMessageStream({ message: userMessage });
        for await (const chunk of stream) {
            if (abortSignal?.aborted) break;
            const text = chunk.text;
            if (text) newAutoContent += text;
        }
        newAutoContent = newAutoContent.trim();

        if (!newAutoContent) {
            console.log('[Reflection] No guidelines generated');
            return { updated: false };
        }

        // Build new WRITER.md content: preserve user section, replace auto section
        const autoBlock = `${AIService.WRITER_AUTO_START}\n${newAutoContent}\n${AIService.WRITER_AUTO_END}`;

        let newWriterMd: string;
        if (writerMdContent) {
            const startIdx = writerMdContent.indexOf(AIService.WRITER_AUTO_START);
            const endIdx = writerMdContent.indexOf(AIService.WRITER_AUTO_END);
            if (startIdx !== -1 && endIdx !== -1) {
                // Replace existing auto section
                newWriterMd =
                    writerMdContent.slice(0, startIdx) +
                    autoBlock +
                    writerMdContent.slice(endIdx + AIService.WRITER_AUTO_END.length);
            } else {
                // No markers found — append auto section
                newWriterMd = writerMdContent.trimEnd() + '\n\n' + autoBlock + '\n';
            }
        } else {
            // WRITER.md doesn't exist yet — create with auto section only
            newWriterMd = autoBlock + '\n';
        }

        await this.fs.writeFile('WRITER.md', newWriterMd);
        console.log('[Reflection] WRITER.md updated');
        return { updated: true };
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

    async *streamChat(sessionId: string, history: Content[], newMessage: string, referencedFiles: string[] = [], abortSignal?: AbortSignal, systemInstructionOverride?: string, options?: { skipPlanMode?: boolean; modelOverride?: string }): AsyncGenerator<any, void, unknown> {
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
        let baseSystemPrompt = systemInstructionOverride || await this.getFullSystemPrompt();
        // Plan Mode instruction: skip when called from annotation revision
        const effectivePlanMode = this.settings.enablePlanMode && !options?.skipPlanMode;
        if (effectivePlanMode) {
            baseSystemPrompt += this.promptService.getPlanModeInstruction();
        }
        const fileTree = await this.getProjectFileTree();
        const fullSystemPrompt = baseSystemPrompt + (fileTree ? `\n\n### Project File Tree (Always Available)\n\`\`\`\n${fileTree}\n\`\`\`\n` : "");

        // Plan Mode: if message contains [Plan Confirmed], update the plan file status
        if (this.settings.enablePlanMode && newMessage.includes('[Plan Confirmed]')) {
            const planPathMatch = newMessage.match(/\[Plan Confirmed\] planPath: ([^\n]+)/);
            if (planPathMatch && planPathMatch[1]) {
                const planPath = planPathMatch[1].trim();
                try {
                    await this.fs.updatePlanStatus(planPath, 'confirmed');
                    console.log(`[PlanMode] Plan confirmed: ${planPath}`);
                } catch (e) {
                    console.warn('[PlanMode] Failed to update plan status:', e);
                }
            }
        }

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

        // Filter out tools that are disabled in settings
        const filteredDeclarations = functionDeclarations
            .filter(fd => fd.name !== 'editFile' || this.settings.enableEditFileTool)
            .filter(fd => fd.name !== 'proposePlan' || effectivePlanMode);

        const tools: Tool[] = [
            {
                functionDeclarations: filteredDeclarations
            },
        ];
           
        const currentModel = options?.modelOverride || this.getCurrentModel();
        if (options?.modelOverride) {
            console.log('[AIService] streamChat using model override:', options.modelOverride);
        }

        let chat;

        // Check if we can reuse an existing chat session (Server Mode)
        // Skip cache when modelOverride is active so the correct model is used
        if (this.settings.contextMode === 'server' && sessionId && this.activeChats.has(sessionId) && !options?.modelOverride) {
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

            // Debug: Check for thought signatures before validation
            if (msg.parts) {
                for (const part of msg.parts) {
                    if ((part as any).thoughtSignature) {
                        console.log(`[AIService] History sanitization: Found thoughtSignature in ${msg.role} message`);
                    }
                    if ((part as any).functionCall && (part as any).functionCall.thoughtSignature) {
                        console.log(`[AIService] History sanitization: Found thoughtSignature in functionCall`);
                    }
                }
            }

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
            model: currentModel,
            config: {
                    systemInstruction: fullSystemPrompt,
                tools: tools,
            },
            history: cleanHistory
        });

            if (this.settings.contextMode === 'server' && sessionId && !options?.modelOverride) {
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

        // Check for large prompt that may trigger empty response bug in gemini-3-pro-preview
        // currentModel was already computed above (with modelOverride applied)
        const estimatedTokens = this.estimateTokenCount(fullSystemPrompt) +
                               this.estimateTokenCount(typeof msgToSend === 'string' ? msgToSend : JSON.stringify(msgToSend));

        if (currentModel.includes('gemini-3') || currentModel.includes('gemini-2.5')) {
            if (estimatedTokens > 20000) {
                console.warn(`[AIService] Very large prompt detected (~${estimatedTokens} tokens). High risk of API errors.`);
                yield {
                    type: "thinking",
                    content: `⚠️ 当前提示词非常大 (~${estimatedTokens} tokens)，很可能导致 API 错误。\n\n强烈建议：\n1. 切换到 Server 模式（强烈推荐）\n2. 切换到 gemini-3-flash 模型\n3. 减少引用的文件数量\n4. 清空对话历史重新开始`
                };
            } else if (estimatedTokens > 10000) {
                console.warn(`[AIService] Large prompt detected (~${estimatedTokens} tokens). This may trigger API errors.`);
                yield {
                    type: "thinking",
                    content: `⚠️ 当前提示词较大 (~${estimatedTokens} tokens)。如果遇到问题，建议：\n1. 切换到 gemini-3-flash 模型\n2. 减少引用的文件\n3. 使用 Server 模式`
                };
            } else {
                console.log(`[AIService] Estimated prompt size: ~${estimatedTokens} tokens`);
            }
        }

        // Loop for tool calls
        let retryCount = 0; // Track retry attempts for empty response workaround

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

                 // Check if this might be an empty response error (HTTP 200 with no content)
                 const mightBeEmptyResponse = e.statusCode === 200 ||
                                              errorMessage.includes("empty") ||
                                              errorMessage.includes("no text") ||
                                              errorMessage.includes("no content");

                 const maxRetries = this.getMaxRetries();
                 if (mightBeEmptyResponse && retryCount < maxRetries - 1) {
                     const delay = this.getRetryDelay(retryCount);
                     console.warn(`[AIService] Possible empty response detected, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

                     // Yield a status message to user
                     yield {
                         type: "thinking",
                         content: `检测到可能的空响应，正在重试 (${retryCount + 1}/${maxRetries})...`
                     };

                     await new Promise(resolve => setTimeout(resolve, delay));
                     retryCount++;
                     continue; // Retry the request
                 }

                 // Not a retryable error or max retries reached
                 if (retryCount >= maxRetries - 1 && mightBeEmptyResponse) {
                     yield {
                         type: "error",
                         content: `连接 Gemini API 时出错（已重试 ${maxRetries} 次）: ${errorDetails}${errorMessage}\n\n建议：\n1. 切换到 gemini-3-flash 模型（更稳定）\n2. 减少引用文件数量\n3. 切换到 Server 模式减少 token 使用`
                     };
                 } else {
                     yield { type: "error", content: `连接 Gemini API 时出错: ${errorDetails}${errorMessage}` };
                 }
                 return;
            }

            let fullText = "";
            let hasReceivedText = false;
            let functionCalls: any[] = [];
            // Store thought signatures for each function call (for debugging)
            const functionCallSignatures = new Map<string, string>();
            let receivedAnyContent = false; // Track if we received any content at all

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

                     // Check for MALFORMED_FUNCTION_CALL error (missing thought signature)
                     if (chunk.finishReason === "MALFORMED_FUNCTION_CALL") {
                         console.error('[AIService] MALFORMED_FUNCTION_CALL detected:', chunk.finishMessage);
                         yield {
                             type: "error",
                             content: `函数调用错误: ${chunk.finishMessage || "Malformed function call"}\n\n这通常是由于对话历史过长导致的。建议：\n1. 切换到 Server 模式（推荐）\n2. 切换到 gemini-3-flash 模型\n3. 减少引用的文件数量`
                         };
                         return;
                     }

                     // Check for empty response (known bug workaround)
                     if (this.isEmptyResponse(chunk) && !receivedAnyContent) {
                         console.warn('[AIService] Detected empty response chunk with finishReason: STOP');
                         // Continue to next chunk to see if there's more content
                         continue;
                     }

                     const text = chunk.text;
                     if (text) {
                         receivedAnyContent = true;
                         hasReceivedText = true;
                         fullText += text;
                         yield { type: "text", content: text };
                     }

                     // New SDK: functionCalls is a property getter on chunk (GenerateContentResponse)
                     const calls = chunk.functionCalls;
                     if (calls && calls.length > 0) {
                         receivedAnyContent = true;
                         console.log(`[AIService] Received ${calls.length} function call(s) from API`);

                         // Process each call and attach thought signature
                         for (const call of calls) {
                             // Extract thought signature if present (required for Gemini 3)
                             const signature = (call as any).thoughtSignature;

                             // Debug: Log the raw structure of the function call
                             console.log(`[AIService] Raw function call structure for ${call.name}:`, JSON.stringify({
                                 name: call.name,
                                 argsKeys: call.args ? Object.keys(call.args) : [],
                                 hasThoughtSignature: !!signature,
                                 thoughtSignatureType: typeof signature,
                                 thoughtSignatureLength: signature?.length
                             }, null, 2));

                             // Store the call WITH its thought signature attached
                             const enrichedCall = {
                                 ...call,
                                 thoughtSignature: signature  // Attach signature to call object
                             };

                             functionCalls.push(enrichedCall);

                             if (signature) {
                                 console.log(`[AIService] ✓ Found thoughtSignature for function call: ${call.name}`);
                                 functionCallSignatures.set(call.name, signature);
                             } else {
                                 console.log(`[AIService] ⚠ No thoughtSignature found for function call: ${call.name} (model may be Gemini 2.5 or earlier)`);
                             }

                             // 立即 yield 工具调用开始信息，包含参数
                             yield {
                                 type: "tool_call_start",
                                 tool: call.name,
                                 args: call.args,
                                 thoughtSignature: signature // Include signature for debugging
                             };
                         }
                     }
                }

                // After stream completes, check if we received any content
                if (!receivedAnyContent && !hasReceivedText && functionCalls.length === 0) {
                    console.warn('[AIService] Stream completed without any content, triggering retry');

                    const maxRetries = this.getMaxRetries();
                    if (retryCount < maxRetries - 1) {
                        const delay = this.getRetryDelay(retryCount);
                        console.warn(`[AIService] Empty response in stream, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

                        yield {
                            type: "thinking",
                            content: `检测到空响应，正在重试 (${retryCount + 1}/${maxRetries})...`
                        };

                        await new Promise(resolve => setTimeout(resolve, delay));
                        retryCount++;
                        continue; // Retry the request
                    } else {
                        // Max retries reached
                        yield {
                            type: "error",
                            content: `模型没有返回文本响应（已重试 ${maxRetries} 次）。建议：\n1. 切换到 gemini-3-flash 模型（更稳定）\n2. 减少引用文件数量\n3. 切换到 Server 模式减少 token 使用`
                        };
                        return;
                    }
                }

                // Reset retry count on successful response
                retryCount = 0;

            } catch (streamError: any) {
                console.error("Error processing stream:", streamError);

                // Check if we should retry
                const isRetryable = streamError.message?.includes("Empty response") ||
                                   streamError.message?.includes("no content") ||
                                   streamError.message?.includes("空响应");

                const maxRetries = this.getMaxRetries();
                if (isRetryable && retryCount < maxRetries - 1) {
                    const delay = this.getRetryDelay(retryCount);
                    console.warn(`[AIService] Retryable stream error, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

                    yield {
                        type: "thinking",
                        content: `检测到流处理错误，正在重试 (${retryCount + 1}/${maxRetries})...`
                    };

                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    continue; // Retry the request
                }

                // Not retryable or max retries reached
                if (retryCount >= maxRetries - 1 && isRetryable) {
                    yield {
                        type: "error",
                        content: `处理响应流时出错（已重试 ${maxRetries} 次）: ${streamError.message || streamError.toString()}\n\n建议：\n1. 切换到 gemini-3-flash 模型\n2. 减少引用文件数量\n3. 切换到 Server 模式`
                    };
                } else {
                    yield { type: "error", content: `处理响应流时出错: ${streamError.message || streamError.toString()}` };
                }
                return;
            }

            // Check if there are function calls to execute
            // Note: In streaming, we collect all function calls from chunks.
            // But we need to execute them and send response.
            // The `stream` loop finishes when the model turn is "done" (either stop or function call).
            
            if (functionCalls.length > 0) {
                 const functionResponses: Part[] = [];
                 let stopAfterProposePlan = false;
                let stopAfterAskUser = false;

                // 将 askUser / proposePlan 移到末尾处理，确保 writeFile/editFile
                // 及其内联的记忆提取在 generator 停止前全部完成。
                functionCalls.sort((a, b) => {
                    const stopTools = ['askUser', 'proposePlan'];
                    return (stopTools.includes(a.name) ? 1 : 0) - (stopTools.includes(b.name) ? 1 : 0);
                });

                 for (const call of functionCalls) {
                     const { name, args, thoughtSignature } = call;
                     // New SDK args might be object directly? Yes.
                     const toolArgs = args as any;
                     let output = "";
                     let undoData: { previousContent: string | null, path: string } | undefined;

                     try {
                        if (name === "proposePlan") {
                             const planPath = this.getPlanFilePath(toolArgs.path);
                             const now = new Date().toISOString();

                             // Build the plan file content with YAML frontmatter
                             const planFileContent = `---\nstatus: draft\nchapter: ${toolArgs.path}\ncreated: ${now}\nconfirmed: null\n---\n\n${toolArgs.content}`;

                             // Save draft plan to vault
                             await this.fs.writeFile(planPath, planFileContent);

                             // Yield plan_proposal chunk to UI for user confirmation
                             yield {
                                 type: "plan_proposal",
                                 planPath: planPath,
                                 chapterPath: toolArgs.path,
                                 content: toolArgs.content
                             };

                             output = "规划已提交给用户审阅。请等待用户在界面中确认规划后再继续写作。用户确认后会发送包含 [Plan Confirmed] 的消息，收到后再调用 writeFile 写入章节正文。";

                             functionResponses.push({
                                 functionResponse: {
                                     name: name,
                                     response: { result: output }
                                 },
                                 thoughtSignature: thoughtSignature
                             });
                             stopAfterProposePlan = true;
                             continue;
                         }
                         if (name === "askUser") {
                             const { question, context, options, multiSelect, recommendation } = toolArgs;

                             // Yield ask_user chunk so the UI renders the AskUserCard
                             yield {
                                 type: "ask_user",
                                 question,
                                 context,
                                 options,
                                 multiSelect: multiSelect ?? false,
                                 recommendation
                             };

                             // Complete the function call cycle so chat history stays consistent
                             functionResponses.push({
                                 functionResponse: {
                                     name: name,
                                     response: { result: "Waiting for user selection." }
                                 },
                                 thoughtSignature: thoughtSignature
                             });
                             stopAfterAskUser = true;
                             continue;
                         }
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

                            // Plan Mode: if writing a chapter file, mark plan as executed
                            if (this.settings.enablePlanMode && this.isChapterFile(targetPath)) {
                                const confirmedPlan = await this.readConfirmedPlan(targetPath);
                                if (confirmedPlan) {
                                    const planPath = this.getPlanFilePath(targetPath);
                                    try {
                                        await this.fs.updatePlanStatus(planPath, 'executed');
                                        console.log(`[PlanMode] Chapter ${targetPath} written from confirmed plan at ${planPath}`);
                                    } catch (e) {
                                        console.warn('[PlanMode] Failed to update plan status to executed:', e);
                                    }
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
                            // Track final chapter content (may be updated by PostCheck)
                            let finalChapterContent = toolArgs.content;
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
                                        finalChapterContent = refinedContent;
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

                                        // Memory extraction after PostCheck (refined path)
                                        if (this.settings.enableMemory && this.settings.autoMemoryUpdate) {
                                            yield { type: "tool_call_start", tool: "memoryExtract", args: { filePath: targetPath } };
                                            try {
                                                const memResult = await this.performMemoryExtraction(targetPath, finalChapterContent, abortSignal);
                                                const entities = memResult?.updatedEntities || [];
                                                yield {
                                                    type: "tool_result",
                                                    tool: "memoryExtract",
                                                    args: { filePath: targetPath },
                                                    result: entities.length > 0
                                                        ? `记忆已更新：\n${entities.map(e => `  - ${e}`).join('\n')}`
                                                        : '本章未检测到需要更新的记忆实体。'
                                                };
                                            } catch (memErr: any) {
                                                yield { type: "tool_result", tool: "memoryExtract", args: { filePath: targetPath }, result: `记忆提取失败：${memErr.message}`, error: true };
                                            }
                                        }

                                        // Self-evolution reflection (only for modifications, not new files)
                                        if (isChapterFile && previousContent !== null && this.settings.enableSelfEvolution) {
                                            yield { type: "tool_call_start", tool: "writerReflect", args: { filePath: targetPath } };
                                            try {
                                                const reflectResult = await this.performWriterMdReflection(previousContent, finalChapterContent, newMessage, abortSignal);
                                                yield { type: "tool_result", tool: "writerReflect", args: { filePath: targetPath }, result: reflectResult?.updated ? '写作指南已更新。' : '未发现需要更新的经验。' };
                                            } catch (reflectErr: any) {
                                                yield { type: "tool_result", tool: "writerReflect", args: { filePath: targetPath }, result: `反思失败：${reflectErr.message}`, error: true };
                                            }
                                        }

                                        // 跳过后续的tool_result yield（因为已经yield过了）
                                        functionResponses.push({
                                            functionResponse: {
                                                name: name,
                                                response: { result: refinedOutput }
                                            },
                                            thoughtSignature: thoughtSignature
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

                            // Memory extraction (no-refinement path: PostCheck passed or PostCheck disabled)
                            if (isChapterFile && this.settings.enableMemory && this.settings.autoMemoryUpdate) {
                                yield { type: "tool_call_start", tool: "memoryExtract", args: { filePath: targetPath } };
                                try {
                                    const memResult = await this.performMemoryExtraction(targetPath, finalChapterContent, abortSignal);
                                    const entities = memResult?.updatedEntities || [];
                                    yield {
                                        type: "tool_result",
                                        tool: "memoryExtract",
                                        args: { filePath: targetPath },
                                        result: entities.length > 0
                                            ? `记忆已更新：\n${entities.map(e => `  - ${e}`).join('\n')}`
                                            : '本章未检测到需要更新的记忆实体。'
                                    };
                                } catch (memErr: any) {
                                    yield { type: "tool_result", tool: "memoryExtract", args: { filePath: targetPath }, result: `记忆提取失败：${memErr.message}`, error: true };
                                }
                            }

                            // Self-evolution reflection (only for modifications, not new files)
                            if (isChapterFile && previousContent !== null && this.settings.enableSelfEvolution) {
                                yield { type: "tool_call_start", tool: "writerReflect", args: { filePath: targetPath } };
                                try {
                                    const reflectResult = await this.performWriterMdReflection(previousContent, finalChapterContent, newMessage, abortSignal);
                                    yield { type: "tool_result", tool: "writerReflect", args: { filePath: targetPath }, result: reflectResult?.updated ? '写作指南已更新。' : '未发现需要更新的经验。' };
                                } catch (reflectErr: any) {
                                    yield { type: "tool_result", tool: "writerReflect", args: { filePath: targetPath }, result: `反思失败：${reflectErr.message}`, error: true };
                                }
                            }

                            // 跳过后续的tool_result yield（因为已经yield过了）
                            functionResponses.push({
                                functionResponse: {
                                    name: name,
                                    response: { result: output }
                                },
                                thoughtSignature: thoughtSignature
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
                                    },
                                    thoughtSignature: thoughtSignature
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
                                // Track final content for memory extraction
                                let finalEditContent: string | null = null;

                                if (isChapterFile && shouldPostCheck && this.settings.enablePostCheck &&
                                    this.settings.postCheckItems && this.settings.postCheckItems.length > 0) {

                                    // Read updated file content for post-check
                                    const updatedContent = await this.fs.readFile(toolArgs.path);
                                    finalEditContent = updatedContent;

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
                                            finalEditContent = refinedContent;

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

                                // Memory extraction (after PostCheck for chapter files)
                                if (isChapterFile && shouldPostCheck && this.settings.enableMemory && this.settings.autoMemoryUpdate) {
                                    const contentForMemory = finalEditContent || await this.fs.readFile(toolArgs.path);
                                    yield { type: "tool_call_start", tool: "memoryExtract", args: { filePath: toolArgs.path } };
                                    try {
                                        const memResult = await this.performMemoryExtraction(toolArgs.path, contentForMemory, abortSignal);
                                        const entities = memResult?.updatedEntities || [];
                                        yield {
                                            type: "tool_result",
                                            tool: "memoryExtract",
                                            args: { filePath: toolArgs.path },
                                            result: entities.length > 0
                                                ? `记忆已更新：\n${entities.map(e => `  - ${e}`).join('\n')}`
                                                : '本章未检测到需要更新的记忆实体。'
                                        };
                                    } catch (memErr: any) {
                                        yield { type: "tool_result", tool: "memoryExtract", args: { filePath: toolArgs.path }, result: `记忆提取失败：${memErr.message}`, error: true };
                                    }
                                }

                                // Self-evolution reflection for editFile (always a modification)
                                if (isChapterFile && shouldPostCheck && previousContent !== null && this.settings.enableSelfEvolution) {
                                    const finalContent = finalEditContent || await this.fs.readFile(toolArgs.path);
                                    yield { type: "tool_call_start", tool: "writerReflect", args: { filePath: toolArgs.path } };
                                    try {
                                        const reflectResult = await this.performWriterMdReflection(previousContent, finalContent, newMessage, abortSignal);
                                        yield { type: "tool_result", tool: "writerReflect", args: { filePath: toolArgs.path }, result: reflectResult?.updated ? '写作指南已更新。' : '未发现需要更新的经验。' };
                                    } catch (reflectErr: any) {
                                        yield { type: "tool_result", tool: "writerReflect", args: { filePath: toolArgs.path }, result: `反思失败：${reflectErr.message}`, error: true };
                                    }
                                }

                                functionResponses.push({
                                    functionResponse: {
                                        name: name,
                                        response: { result: output }
                                    },
                                    thoughtSignature: thoughtSignature
                                });
                                continue;

                            } catch (e: any) {
                                output = `Error executing editFile: ${e.message}`;
                            }
                        } else if (name === "addAnnotation") {
                            const { path, type, target, suggestion } = toolArgs as {
                                path: string;
                                type: 'local' | 'global';
                                target: string;
                                suggestion: string;
                            };
                            try {
                                const currentContent = await this.fs.readFile(path);
                                const { addAnnotationToText } = await import('../editor/annotation_parser');
                                const updatedContent = addAnnotationToText(currentContent, type, target, suggestion);
                                await this.fs.writeFile(path, updatedContent);
                                output = `Annotation added to ${path}: [${type}] "${target ? target.substring(0, 30) : 'global'}"`;
                            } catch (e: any) {
                                output = `Failed to add annotation to ${path}: ${e.message}`;
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
                         },
                         thoughtSignature: thoughtSignature
                     });
                 }
                 
                 // Send function responses back to the model to complete the turn
                 // msgToSend must be compatible with SendMessageParameters 'message'
                 // In new SDK, we can pass Part[] directly or object
                 console.log(`[AIService] Sending ${functionResponses.length} function response(s) back to API`);
                 console.log(`[AIService] Function responses structure:`, JSON.stringify(functionResponses.map(fr => ({
                     name: fr.functionResponse?.name,
                     hasResult: !!fr.functionResponse?.response
                 })), null, 2));

                 // Check if we're using SDK's ChatSession (should auto-handle signatures)
                 console.log(`[AIService] Using SDK ChatSession for function response - SDK should handle signature preservation automatically`);

                 // 注意：writeFile/editFile（含内联记忆提取）已在上方 for 循环中全部完成，
                 // 因为 askUser/proposePlan 被排序到了末尾。

                 // If proposePlan was called, send the tool response to keep chat history consistent,
                 // then STOP the loop. The AI must not continue until the user confirms via [Plan Confirmed].
                 if (stopAfterProposePlan) {
                     try {
                         await chat.sendMessage(functionResponses);
                     } catch (e) {
                         console.warn('[PlanMode] Failed to send proposePlan tool response to chat history:', e);
                     }
                     // Yield history update so UI's chatHistory stays in sync for resume
                     try {
                         const updatedHistory = await chat.getHistory();
                         yield { type: 'history_update', history: updatedHistory };
                     } catch (e) {
                         console.warn('[PlanMode] Failed to get history after proposePlan:', e);
                     }
                     return; // Stop the generator — wait for user to send [Plan Confirmed]
                 }

                 // If askUser was called, send the tool response to keep chat history consistent,
                 // then STOP the loop. The AI will continue after the user submits their selection.
                 if (stopAfterAskUser) {
                     try {
                         await chat.sendMessage(functionResponses);
                     } catch (e) {
                         console.warn('[askUser] Failed to send askUser tool response to chat history:', e);
                     }
                     // Yield history update so UI's chatHistory stays in sync for resume
                     try {
                         const updatedHistory = await chat.getHistory();
                         yield { type: 'history_update', history: updatedHistory };
                     } catch (e) {
                         console.warn('[askUser] Failed to get history after askUser:', e);
                     }
                     return; // Stop the generator — wait for user selection to be sent as a new message
                 }

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
                console.log(`[AIService] Retrieved history length: ${updatedHistory.length}`);

                // Debug: Check if thought signatures are preserved in history
                for (let i = 0; i < updatedHistory.length; i++) {
                    const msg = updatedHistory[i];
                    if (msg.parts) {
                        for (const part of msg.parts) {
                            if ((part as any).thoughtSignature) {
                                console.log(`[AIService] ✓ History[${i}] contains thoughtSignature in part`);
                            }
                            if ((part as any).functionCall && (part as any).functionCall.thoughtSignature) {
                                console.log(`[AIService] ✓ History[${i}] functionCall has thoughtSignature`);
                            }
                        }
                    }
                }

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
