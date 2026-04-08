/**
 * Shared type definitions for the prompt system.
 * These interfaces mirror the structure of DEFAULT_PROMPTS and are used
 * by PromptService for type-safe access.
 */

export interface I18nText {
    zh: string;
    en?: string | null;
}

export interface TemplateConfig {
    zh: string;
    en?: string | null;
    template: boolean;
    variables: string[];
}

export interface OptionalPrompt extends I18nText {
    optional: boolean;
    warning: string;
}

export interface ToolDefinition {
    id: string;
    name: I18nText;
    prompt: I18nText;
}

export interface FunctionParamProp {
    type: string;
    description: I18nText;
}

export interface FunctionDef {
    name: string;
    description: I18nText;
    parameters: {
        type: string;
        properties: Record<string, FunctionParamProp>;
        required: string[];
    };
}

export interface PostCheckItemDef {
    id: string;
    checkPrompt: I18nText;
}

export interface PromptsConfig {
    version: string;
    system: {
        base: I18nText;
        jailbreak: OptionalPrompt;
        styleGuideInstruction: TemplateConfig;
        referenceModeInstruction: I18nText;
        planModeInstruction: I18nText;
        writingRules: I18nText;
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
    memory: {
        extractionSystemPrompt: TemplateConfig;
        extractionUserMessage: TemplateConfig;
        systemInstruction: TemplateConfig;
    };
}
