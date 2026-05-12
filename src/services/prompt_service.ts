import { Notice } from "obsidian";
import type VoyaruPlugin from "../main";
import type { AgentTool, PostCheckItem } from "../settings";
import { Type } from "@google/genai";
import type { FunctionDeclaration } from "@google/genai";
import { DEFAULT_PROMPTS } from "../prompts";
import type {
    I18nText,
    TemplateConfig,
    OptionalPrompt,
    ToolDefinition,
    FunctionDef,
    PostCheckItemDef,
    PromptsConfig
} from "../prompts/types";

/**
 * Parameters for local edit user message
 */
export interface LocalEditParams {
    filePath: string;
    startLine: number;
    endLine: number;
    originalContent: string;
    contextBefore: string;
    contextAfter: string;
    query: string;
}

/**
 * Service for managing AI prompts from prompts.json
 * Handles loading, parsing, template substitution, and i18n
 */
export class PromptService {
    private prompts: PromptsConfig | null = null;
    private currentLanguage: 'zh' | 'en' = 'zh';

    constructor(private plugin: VoyaruPlugin) {}

    /**
     * Load prompts from embedded DEFAULT_PROMPTS
     * Should be called during plugin initialization
     *
     * 核心系统指令始终从代码内嵌的 DEFAULT_PROMPTS 加载，
     * 确保用户更新插件版本后立即使用最新指令，
     * 不再从本地 prompts.json 文件读取。
     */
    async loadPrompts(): Promise<void> {
        try {
            // 核心系统指令始终从代码内嵌的 DEFAULT_PROMPTS 加载
            // 确保用户更新插件版本后立即使用最新指令
            this.prompts = DEFAULT_PROMPTS;
            console.log(`[PromptService] Loaded embedded prompts version ${this.prompts.version}`);

            // Validate structure
            this.validatePromptsStructure();
        } catch (error) {
            console.error('[PromptService] Error loading prompts:', error);
            throw error; // 如果内嵌提示有问题，应该抛出错误而不是静默失败
        }
    }

    /**
     * Validate the structure of loaded prompts
     */
    private validatePromptsStructure(): void {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const required = ['version', 'system', 'tools', 'postCheck', 'localEdit'];
        for (const key of required) {
            if (!(key in this.prompts)) {
                throw new Error(`Missing required key in prompts.json: ${key}`);
            }
        }

        console.log('[PromptService] Prompts structure validated successfully');
    }

    /**
     * Get text in current language with fallback
     */
    private getText(obj: I18nText | null | undefined): string {
        if (!obj) return '';
        return obj[this.currentLanguage] || obj.zh || '';
    }

    /**
     * Substitute template variables in a string
     * Supports ${variable} syntax
     */
    private substituteTemplate(template: string, variables: Record<string, any>): string {
        let result = template;

        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
            result = result.replace(regex, value !== undefined && value !== null ? String(value) : '');
        }

        return result;
    }

    /**
     * Get base system prompt (with optional jailbreak content)
     * @param includeJailbreak - Whether to include the jailbreak prompt (default: false)
     */
    getSystemPrompt(includeJailbreak: boolean = false): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded. Call loadPrompts() first.');
        }

        let prompt = this.getText(this.prompts.system.base);

        if (includeJailbreak && this.prompts.system.jailbreak.optional) {
            console.warn('[PromptService] Jailbreak content included:', this.prompts.system.jailbreak.warning);
            prompt += '\n\n' + this.getText(this.prompts.system.jailbreak);
        }

        return prompt;
    }

    /**
     * Get style guide instruction with path substitution
     * @param styleGuidePath - Path to the style guide file
     */
    getStyleGuideInstruction(styleGuidePath: string): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.system.styleGuideInstruction);
        return this.substituteTemplate(template, { styleGuidePath });
    }

    /**
     * Get reference mode instruction for path-based file references
     */
    getReferenceModeInstruction(): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        return this.getText(this.prompts.system.referenceModeInstruction);
    }

    /**
     * Get plan mode system instruction (appended when plan mode is active)
     */
    getPlanModeInstruction(): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        return this.getText(this.prompts.system.planModeInstruction);
    }

    /**
     * Get annotation mode system instruction (appended when handling annotation revisions)
     */
    getAnnotationModeInstruction(): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        return this.getText(this.prompts.system.annotationModeInstruction);
    }

    /**
     * Get core writing behavior rules (always appended, not shown in settings UI)
     */
    getWritingRules(): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        return this.getText(this.prompts.system.writingRules);
    }

    /**
     * Get default agent tools
     */
    getDefaultTools(): AgentTool[] {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        return this.prompts.tools.default.map(tool => ({
            name: this.getText(tool.name),
            prompt: this.getText(tool.prompt)
        }));
    }

    /**
     * Recursively convert a FunctionParamProp schema to Gemini API format.
     * Supports nested ARRAY (with items) and OBJECT (with properties) types.
     */
    private convertParamSchema(propDef: import('../prompts/types').FunctionParamProp): any {
        const typeMap: Record<string, Type> = {
            'OBJECT': Type.OBJECT,
            'STRING': Type.STRING,
            'NUMBER': Type.NUMBER,
            'BOOLEAN': Type.BOOLEAN,
            'ARRAY': Type.ARRAY
        };

        const result: any = {
            type: typeMap[propDef.type] || Type.STRING,
        };

        if (propDef.description) {
            result.description = this.getText(propDef.description);
        }

        if (propDef.type === 'OBJECT' && propDef.properties) {
            result.properties = {};
            for (const [name, nested] of Object.entries(propDef.properties)) {
                result.properties[name] = this.convertParamSchema(nested);
            }
            if (propDef.required) {
                result.required = propDef.required;
            }
        }

        if (propDef.type === 'ARRAY' && propDef.items) {
            result.items = this.convertParamSchema(propDef.items);
        }

        return result;
    }

    /**
     * Get function declaration for AI tool calling
     * @param toolName - Name of the tool (writeFile, readFile, deleteFile)
     */
    getToolDefinition(toolName: string): FunctionDeclaration {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const funcDef = this.prompts.tools.functionDefinitions[toolName];
        if (!funcDef) {
            throw new Error(`Tool definition not found: ${toolName}`);
        }

        const typeMap: Record<string, Type> = {
            'OBJECT': Type.OBJECT,
            'STRING': Type.STRING,
            'NUMBER': Type.NUMBER,
            'BOOLEAN': Type.BOOLEAN,
            'ARRAY': Type.ARRAY
        };

        // Build properties object, supporting nested ARRAY/OBJECT schemas
        const properties: Record<string, any> = {};
        for (const [propName, propDef] of Object.entries(funcDef.parameters.properties)) {
            properties[propName] = this.convertParamSchema(propDef);
        }

        return {
            name: funcDef.name,
            description: this.getText(funcDef.description),
            parameters: {
                type: typeMap[funcDef.parameters.type] || Type.OBJECT,
                properties,
                required: funcDef.parameters.required
            }
        };
    }

    /**
     * Get all tool definitions for AI function calling
     */
    getAllToolDefinitions(): FunctionDeclaration[] {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        return Object.keys(this.prompts.tools.functionDefinitions).map(
            toolName => this.getToolDefinition(toolName)
        );
    }

    /**
     * Get post-check system prompt with substitutions
     * @param basePrompt - Base system prompt to include
     * @param fileTree - Project file tree string
     * @param checkItems - Array of check items
     */
    getPostCheckSystemPrompt(
        basePrompt: string,
        fileTree: string,
        checkItems: PostCheckItem[]
    ): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const checkItemsList = checkItems
            .map((item, index) => `${index + 1}. ${item.checkPrompt}`)
            .join('\n\n');

        const template = this.getText(this.prompts.postCheck.systemPrompt);

        // Note: The template itself contains conditional logic for fileTree
        // We need to evaluate it properly
        let result = this.substituteTemplate(template, {
            baseSystemPrompt: basePrompt,
            fileTree: fileTree,
            checkItemsList: checkItemsList
        });

        // Handle the conditional fileTree section
        // The template has: ${fileTree ? `### Project File Tree...` : ''}
        // We need to handle this JavaScript-style conditional
        if (fileTree) {
            result = result.replace(
                /\$\{fileTree \? `([^`]+)` : ''\}/g,
                (_, content) => this.substituteTemplate(content, { fileTree })
            );
        } else {
            result = result.replace(/\$\{fileTree \? `[^`]+` : ''\}/g, '');
        }

        return result;
    }

    /**
     * Get post-check user message with substitutions
     * @param filePath - Path to the file being checked
     * @param originalContent - Original file content
     */
    getPostCheckUserMessage(filePath: string, originalContent: string): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.postCheck.userMessage);
        return this.substituteTemplate(template, {
            filePath,
            originalContent
        });
    }

    /**
     * Get default post-check items
     */
    getDefaultPostCheckItems(): PostCheckItem[] {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        return this.prompts.postCheck.defaultItems.map(item => ({
            id: item.id,
            checkPrompt: this.getText(item.checkPrompt)
        }));
    }

    /**
     * Get local edit system instruction with base prompt
     * @param basePrompt - Base system prompt to include
     */
    getLocalEditSystemInstruction(basePrompt: string): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.localEdit.systemInstruction);
        return this.substituteTemplate(template, { baseSystemPrompt: basePrompt });
    }

    /**
     * Get local edit user message with all parameters
     * @param params - LocalEditParams object with all required fields
     */
    getLocalEditUserMessage(params: LocalEditParams): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.localEdit.userMessage);
        return this.substituteTemplate(template, {
            filePath: params.filePath,
            startLine: params.startLine + 1, // Convert 0-indexed to 1-indexed for display
            endLine: params.endLine + 1,
            originalContent: params.originalContent,
            contextBefore: params.contextBefore,
            contextAfter: params.contextAfter,
            query: params.query
        });
    }

    /**
     * Get memory extraction system prompt with base prompt substitution
     */
    getMemoryExtractionSystemPrompt(basePrompt: string): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.memory.extractionSystemPrompt);
        return this.substituteTemplate(template, { baseSystemPrompt: basePrompt });
    }

    /**
     * Get memory extraction user message with all parameters
     */
    getMemoryExtractionUserMessage(params: {
        chapterPath: string;
        chapterContent: string;
        memoryIndex: string;
        relatedEntityContents: string;
    }): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.memory.extractionUserMessage);
        return this.substituteTemplate(template, {
            chapterPath: params.chapterPath,
            chapterContent: params.chapterContent,
            memoryIndex: params.memoryIndex,
            relatedEntityContents: params.relatedEntityContents
        });
    }

    /**
     * Get reflection system prompt with base prompt substitution
     */
    getReflectionSystemPrompt(basePrompt: string): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.reflection.systemPrompt);
        return this.substituteTemplate(template, { baseSystemPrompt: basePrompt });
    }

    /**
     * Get reflection user message with all parameters
     */
    getReflectionUserMessage(params: {
        userInstruction: string;
        originalContent: string;
        modifiedContent: string;
        existingGuidelines: string;
    }): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.reflection.userMessage);
        return this.substituteTemplate(template, {
            userInstruction: params.userInstruction,
            originalContent: params.originalContent,
            modifiedContent: params.modifiedContent,
            existingGuidelines: params.existingGuidelines
        });
    }

    /**
     * Get memory mode instruction for injection into main system prompt
     */
    getMemoryModeInstruction(memoryIndex: string): string {
        if (!this.prompts) {
            throw new Error('Prompts not loaded');
        }

        const template = this.getText(this.prompts.memory.systemInstruction);
        return this.substituteTemplate(template, { memoryIndex });
    }

    /**
     * Set current language for text retrieval
     * @param lang - Language code ('zh' or 'en')
     */
    setLanguage(lang: 'zh' | 'en'): void {
        this.currentLanguage = lang;
        console.log(`[PromptService] Language set to: ${lang}`);
    }

    /**
     * Get current prompts version
     */
    getVersion(): string {
        return this.prompts?.version || 'unknown';
    }
}
