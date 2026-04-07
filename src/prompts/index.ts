/**
 * Prompt system entry point.
 * Assembles all prompt modules into DEFAULT_PROMPTS with the same structure
 * as the original default_prompts.ts. PromptService imports from here.
 *
 * To add a new prompt:
 * 1. Create or edit the appropriate module file in this directory
 * 2. Import it here and add it to DEFAULT_PROMPTS
 * 3. Add a getter method in PromptService if needed
 */
import { BASE_SYSTEM_PROMPT } from './system/base';
import { JAILBREAK } from './system/jailbreak';
import { STYLE_GUIDE_INSTRUCTION } from './system/style_guide_instruction';
import { REFERENCE_MODE_INSTRUCTION } from './system/reference_mode';
import { PLAN_MODE_INSTRUCTION } from './system/plan_mode';
import { WRITING_RULES } from './system/writing_rules';
import { DEFAULT_AGENT_TOOLS } from './tools/agent_tools';
import { FUNCTION_DEFINITIONS } from './tools/function_definitions';
import { PLAN_TOOL_DEFINITIONS } from './tools/plan_tools';
import { ANNOTATION_TOOL_DEFINITIONS } from './tools/annotation_tools';
import { POST_CHECK_SYSTEM_PROMPT } from './post_check/system_prompt';
import { POST_CHECK_USER_MESSAGE } from './post_check/user_message';
import { DEFAULT_POST_CHECK_ITEMS } from './post_check/default_items';
import { LOCAL_EDIT_SYSTEM_INSTRUCTION } from './local_edit/system_instruction';
import { LOCAL_EDIT_USER_MESSAGE } from './local_edit/user_message';
import type { PromptsConfig } from './types';

export const DEFAULT_PROMPTS: PromptsConfig = {
    version: "1.0.0",
    system: {
        base: BASE_SYSTEM_PROMPT,
        jailbreak: JAILBREAK,
        styleGuideInstruction: STYLE_GUIDE_INSTRUCTION,
        referenceModeInstruction: REFERENCE_MODE_INSTRUCTION,
        planModeInstruction: PLAN_MODE_INSTRUCTION,
        writingRules: WRITING_RULES
    },
    tools: {
        default: DEFAULT_AGENT_TOOLS,
        functionDefinitions: { ...FUNCTION_DEFINITIONS, ...PLAN_TOOL_DEFINITIONS, ...ANNOTATION_TOOL_DEFINITIONS }
    },
    postCheck: {
        systemPrompt: POST_CHECK_SYSTEM_PROMPT,
        userMessage: POST_CHECK_USER_MESSAGE,
        defaultItems: DEFAULT_POST_CHECK_ITEMS
    },
    localEdit: {
        systemInstruction: LOCAL_EDIT_SYSTEM_INSTRUCTION,
        userMessage: LOCAL_EDIT_USER_MESSAGE
    }
};
