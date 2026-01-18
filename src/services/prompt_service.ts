import { Notice } from "obsidian";
import type VoyaruPlugin from "../main";
import type { AgentTool, PostCheckItem } from "../settings";
import { Type } from "@google/genai";
import type { FunctionDeclaration } from "@google/genai";
import { DEFAULT_PROMPTS } from "./default_prompts";

/**
 * Multilingual text object with zh/en support
 */
interface I18nText {
    zh: string;
    en?: string | null;
}

/**
 * Template configuration for prompts that require variable substitution
 */
interface TemplateConfig {
    zh: string;
    en?: string | null;
    template: boolean;
    variables: string[];
}

/**
 * Optional prompt with warning
 */
interface OptionalPrompt extends I18nText {
    optional: boolean;
    warning: string;
}

/**
 * Tool definition in prompts.json
 */
interface ToolDefinition {
    id: string;
    name: I18nText;
    prompt: I18nText;
}

/**
 * Function definition in prompts.json
 */
interface FunctionDef {
    name: string;
    description: I18nText;
    parameters: {
        type: string;
        properties: Record<string, {
            type: string;
            description: I18nText;
        }>;
        required: string[];
    };
}

/**
 * Post-check item in prompts.json
 */
interface PostCheckItemDef {
    id: string;
    checkPrompt: I18nText;
}

/**
 * Root structure of prompts.json
 */
interface PromptsConfig {
    version: string;
    system: {
        base: I18nText;
        jailbreak: OptionalPrompt;
        styleGuideInstruction: TemplateConfig;
        referenceModeInstruction: I18nText;
    };
    tools: {
        default: ToolDefinition[];
        functionDefinitions: Record<string, FunctionDef>;
    };
    postCheck: {
        systemPrompt: TemplateConfig;
        userMessage: TemplateConfig;
        defaultItems: PostCheckItemDef[];
    };
    localEdit: {
        systemInstruction: TemplateConfig;
        userMessage: TemplateConfig;
    };
}

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
            this.prompts = DEFAULT_PROMPTS as unknown as PromptsConfig;
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

        // Convert string type to Type enum
        const typeMap: Record<string, Type> = {
            'OBJECT': Type.OBJECT,
            'STRING': Type.STRING,
            'NUMBER': Type.NUMBER,
            'BOOLEAN': Type.BOOLEAN,
            'ARRAY': Type.ARRAY
        };

        // Build properties object
        const properties: Record<string, any> = {};
        for (const [propName, propDef] of Object.entries(funcDef.parameters.properties)) {
            properties[propName] = {
                type: typeMap[propDef.type] || Type.STRING,
                description: this.getText(propDef.description)
            };
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
