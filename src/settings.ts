import { App, PluginSettingTab, Setting, Plugin, TFolder, debounce } from "obsidian";
import { SystemPromptModal } from "./modals/SystemPromptModal";
import { ToolsManagerModal } from "./modals/ToolsManagerModal";
import { PostCheckManagerModal } from "./modals/PostCheckManagerModal";
import { FolderSuggestModal } from "./components/FolderSuggest";
import { FolderConfigModal } from "./modals/FolderConfigModal";
import { ProviderConfigModal } from "./modals/ProviderConfigModal";
import { ProviderType, ModelInfo, PROVIDER_NAMES } from "./services/adapters";

// Re-export types for convenience
export type { ProviderType, ModelInfo };

export interface AgentTool {
    name: string;
    prompt: string;
}

export interface PostCheckItem {
    id: string;
    checkPrompt: string;
}

export type MessageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Message {
    role: 'user' | 'model' | 'system' | 'error';
    content: string;
    type?: 'text' | 'thinking' | 'tool_result';
    tool?: string;
    toolData?: {
        args?: any;
        result?: any;
        logs?: any[];
        undoData?: {
            previousContent: string | null; // null means file was created
            path: string;
        };
    }; // To store args, result, logs, undo info
    debugData?: {
        systemInstruction: string;
        userMessage: any;
    };
    id?: string;
    referencedFiles?: string[];
    // Tool call status tracking for Claude Code-style display
    status?: MessageStatus;
    startTime?: number;
    endTime?: number;
    expanded?: boolean;
}

export interface Session {
    id: string;
    name: string;
    messages: Message[];
    chatHistory: any[];
    timestamp: number;
}

export interface QueryHistoryItem {
    id: string;
    query: string;
    referencedFiles: string[];
    timestamp: number;
}

// 新增：提供商配置接口
export interface ProviderConfig {
    id: string;                     // 唯一标识符
    type: ProviderType;             // 提供商类型
    name: string;                   // 用户自定义名称
    apiKey: string;                 // API密钥
    baseURL?: string;               // 自定义API端点（可选）
    models?: ModelInfo[];           // 缓存的模型列表
    selectedModel?: string;         // 当前选中的模型
}

export interface VoyaruSettings {
    // 保留旧字段以支持数据迁移
    apiKey?: string;                // 将被迁移到providers
    model?: string;                 // 将被迁移到providers

    // 新增：多提供商配置
    providers?: ProviderConfig[];   // 所有配置的提供商
    activeProviderId?: string;      // 当前激活的提供商ID

    /** @deprecated Use customPrompt instead. Will be migrated automatically. */
    systemPrompt: string;
    customPrompt: string;           // 用户自定义提示词部分
    folders: {
        chapters: string;
        characters: string;
        outlines: string;
        notes: string;
        knowledge: string;
    };
    tools: AgentTool[];
    postCheckItems: PostCheckItem[];
    enablePostCheck: boolean;
    enableEditFileTool: boolean;    // 启用 editFile 工具
    sessions: Session[];
    lastSessionId: string | null;
    fontSize: number;
    contextMode: 'wysiwyg' | 'server' | 'single';
    referenceMode: 'content' | 'path';
    maxFilesInPopup: number;
    queryHistory: QueryHistoryItem[];
    sendWithShiftEnter: boolean;

    // 等待消息配置
    waitingMessageDelay: number;      // 显示等待消息前的延迟（毫秒）
    waitingMessageInterval: number;   // 等待消息切换间隔（毫秒）
    waitingMessages: string[];        // 预设等待文字列表
    useProjectContentAsWaitingMessages: boolean;  // 使用项目内容作为等待消息

    // API 重试配置
    maxRetries: number;               // API 请求失败时的最大重试次数
}

// Note: DEFAULT_TOOLS and DEFAULT_POST_CHECK_ITEMS are now loaded from prompts.json
// via PromptService. These constants are removed to avoid duplication.
// Migration: On first load, settings will be populated from prompts.json if empty.

export const MODELS = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Thinking)' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro (Thinking)' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash (Fast & Thinking)' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
];

export const DEFAULT_SETTINGS: VoyaruSettings = {
    // 旧字段保留为可选（用于迁移）
    apiKey: undefined,
    model: undefined,

    // 新的多提供商配置
    providers: [
        {
            id: 'default-gemini',
            type: 'gemini',
            name: 'Google Gemini',
            apiKey: '',
            models: [],
            selectedModel: 'gemini-3-pro-preview'
        }
    ],
    activeProviderId: 'default-gemini',

    enablePostCheck: true,
    enableEditFileTool: true,
    queryHistory: [],
    sendWithShiftEnter: false,
    // System prompt is now loaded from prompts.json via PromptService
    // Will be populated during plugin initialization if empty
    systemPrompt: '',  // 废弃,保留用于迁移检测
    customPrompt: '',  // 用户自定义提示词,默认为空
    folders: {
        chapters: "Chapters",
        characters: "Characters",
        outlines: "Outlines",
        notes: "Notes",
        knowledge: "Knowledge"
    },
    // Tools and postCheckItems are now loaded from prompts.json
    // Will be populated during plugin initialization if empty
    tools: [],
    postCheckItems: [],
    sessions: [],
    lastSessionId: null,
    fontSize: 14,
    contextMode: 'server',
    referenceMode: 'path',
    maxFilesInPopup: 10,

    // 等待消息配置
    waitingMessageDelay: 0,  // 改为0表示立即显示等待消息（原来500ms延迟可能导致来不及显示）
    waitingMessageInterval: 1000,
    waitingMessages: [
        "思考中...",
        "搜索枯肠中...",
        "绞尽脑汁中...",
        "正在查阅资料...",
        "正在削铅笔...",
        "组织语言中...",
        "灵感涌现中..."
    ],
    useProjectContentAsWaitingMessages: false,  // 使用项目内容作为等待消息

    // API 重试配置
    maxRetries: 3  // 默认重试3次
};

export class VoyaruSettingTab extends PluginSettingTab {
    plugin: any; // Using any to avoid circular import issues for now, or use interface
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        // Prevent ESC from closing the settings modal
        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
            }
        };
        const settingsModal = this.containerEl.closest('.modal');
        if (settingsModal) {
            settingsModal.removeEventListener('keydown', this.escHandler, true);
            settingsModal.addEventListener('keydown', this.escHandler, true);
        }

        const { containerEl } = this;

        containerEl.empty();

        const saveSettingsDebounced = debounce(async () => {
             console.log('Debounced save triggered');
             await this.plugin.saveSettings();
        }, 1000, true);

        // ========== AI Provider Section ==========
        containerEl.createEl('h2', { text: 'AI 提供商配置' });

        // 当前激活的提供商
        const providers = this.plugin.settings.providers || [];
        if (providers.length > 0) {
            new Setting(containerEl)
                .setName('当前激活的提供商')
                .setDesc('选择要使用的 AI 提供商')
                .addDropdown(dropdown => {
                    providers.forEach((provider: ProviderConfig) => {
                        dropdown.addOption(provider.id, provider.name);
                    });

                    dropdown
                        .setValue(this.plugin.settings.activeProviderId || '')
                        .onChange(async (value) => {
                            this.plugin.settings.activeProviderId = value;
                            await this.plugin.saveSettings();
                            // 通知 AIService 更新适配器
                            await this.plugin.aiService.updateSettings(this.plugin.settings);
                        });
                });
        } else {
            containerEl.createEl('p', {
                text: '⚠️ 还没有配置任何提供商，请点击下方"添加提供商"按钮',
                cls: 'setting-item-description'
            });
        }

        // 提供商列表
        const providersContainer = containerEl.createDiv('providers-list');
        providersContainer.style.marginBottom = '20px';
        this.renderProvidersList(providersContainer);

        // 添加新提供商按钮
        new Setting(containerEl)
            .setName('管理提供商')
            .setDesc('添加、编辑或删除 AI 提供商配置')
            .addButton(button => {
                button
                    .setButtonText('添加提供商')
                    .setIcon('plus')
                    .onClick(() => {
                        new ProviderConfigModal(this.app, null, async (config) => {
                            if (!this.plugin.settings.providers) {
                                this.plugin.settings.providers = [];
                            }
                            this.plugin.settings.providers.push(config);

                            // 如果这是第一个提供商，自动设为激活
                            if (this.plugin.settings.providers.length === 1) {
                                this.plugin.settings.activeProviderId = config.id;
                            }

                            await this.plugin.saveSettings();
                            this.display(); // 重新渲染
                        }).open();
                    });
            });

        containerEl.createEl('h3', { text: 'Folder Configuration' });
        
        new Setting(containerEl)
            .setName('文件夹配置')
            .setDesc('配置各类文件的存储位置（章节、角色、大纲、笔记、知识库）')
            .addButton(button => button
                .setButtonText('管理文件夹')
                .onClick(() => {
                    new FolderConfigModal(
                        this.app,
                        this.plugin.settings,
                        async (newFolders) => {
                            this.plugin.settings.folders = newFolders;
                            await this.plugin.saveSettings();
                        }
                    ).open();
                }));

        containerEl.createEl('h3', { text: 'Agent Configuration' });
        
        new Setting(containerEl)
            .setName('上下文模式')
            .setDesc('选择上下文的管理方式')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('wysiwyg', '所见即所得 (完全同步)')
                    .addOption('server', '服务器维护 (节省Token)')
                    .addOption('single', '单轮对话 (不发送历史)')
                    .setValue(this.plugin.settings.contextMode || 'wysiwyg')
                    .onChange(async (value: 'wysiwyg' | 'server' | 'single') => {
                        this.plugin.settings.contextMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('引用方式')
            .setDesc('选择引用文件时的处理方式')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('content', '全文引用 (直接发送内容)')
                    .addOption('path', '路径引用 (让模型自己读取)')
                    .setValue(this.plugin.settings.referenceMode || 'content')
                    .onChange(async (value) => {
                        this.plugin.settings.referenceMode = value;
                        await this.plugin.saveSettings();
                    });
            });
        
        new Setting(containerEl)
            .setName('核心系统指令 (只读)')
            .setDesc('查看插件内置的核心指令，包含所有工具使用指导等。此部分不可编辑，确保 AI 始终正确使用工具。')
            .addButton(button => button
                .setButtonText('查看核心指令')
                .onClick(() => {
                    const corePrompt = this.plugin.promptService.getSystemPrompt(false);
                    new SystemPromptModal(
                        this.app,
                        corePrompt,
                        async () => {
                            // 只读，不保存
                        },
                        true  // readOnly = true
                    ).open();
                }));

        new Setting(containerEl)
            .setName('自定义提示词')
            .setDesc('添加个性化指令，如语气风格、创作偏好等。核心工具使用指导由插件自动管理，无需手动配置。')
            .addButton(button => button
                .setButtonText('编辑自定义提示词')
                .onClick(() => {
                    new SystemPromptModal(
                        this.app,
                        this.plugin.settings.customPrompt,
                        async (newPrompt) => {
                            this.plugin.settings.customPrompt = newPrompt;
                            await this.plugin.saveSettings();
                        }
                    ).open();
                }));

        new Setting(containerEl)
            .setName('Manage Tools')
            .setDesc('Add, edit, or remove custom tools for your AI agent.')
            .addButton(button => button
                .setButtonText('Manage Tools')
                .onClick(() => {
                    new ToolsManagerModal(
                        this.app,
                        this.plugin.settings.tools,
                        async (newTools) => {
                            this.plugin.settings.tools = newTools;
                            await this.plugin.saveSettings();
                        }
                    ).open();
                }));
        
        new Setting(containerEl)
            .setName('启用 editFile 工具')
            .setDesc('使用基于行号的部分编辑功能，可大幅减少 token 消耗（推荐开启）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableEditFileTool)
                .onChange(async (value) => {
                    this.plugin.settings.enableEditFileTool = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('启用后置检查')
            .setDesc('开启后，AI完成写作后会自动进行内容检查和润色。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enablePostCheck)
                .onChange(async (value) => {
                    this.plugin.settings.enablePostCheck = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('管理后置检查项')
            .setDesc('配置写作完成后的自动检查和润色规则。')
            .addButton(button => button
                .setButtonText('管理后置检查项')
                .onClick(() => {
                    new PostCheckManagerModal(
                        this.app,
                        this.plugin.settings.postCheckItems,
                        async (newItems) => {
                            this.plugin.settings.postCheckItems = newItems;
                            await this.plugin.saveSettings();
                        }
                    ).open();
                }));
        
        containerEl.createEl('h3', { text: 'UI Configuration' });
        
        new Setting(containerEl)
            .setName('发送方式')
            .setDesc('选择发送消息的快捷键方式')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('enter', 'Enter 发送（Shift+Enter 换行）')
                    .addOption('shift_enter', 'Shift+Enter 发送（Enter 换行）')
                    .setValue(this.plugin.settings.sendWithShiftEnter ? 'shift_enter' : 'enter')
                    .onChange(async (value) => {
                        this.plugin.settings.sendWithShiftEnter = value === 'shift_enter';
                        await this.plugin.saveSettings();
                    });
            });
        
        new Setting(containerEl)
            .setName('文件列表最大显示数量')
            .setDesc('在聊天输入框使用 @ 时，最多显示多少个文件（1-200）')
            .addText(text => text
                .setPlaceholder('10')
                .setValue(String(this.plugin.settings.maxFilesInPopup))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 1 && num <= 200) {
                        this.plugin.settings.maxFilesInPopup = num;
                        await this.plugin.saveSettings();
                    }
                }));

        // ========== 等待消息配置 ==========
        containerEl.createEl('h3', { text: '等待消息配置' });

        new Setting(containerEl)
            .setName('显示等待消息的延迟')
            .setDesc('AI 无输出多少毫秒后显示等待消息（100-2000）')
            .addText(text => text
                .setPlaceholder('500')
                .setValue(String(this.plugin.settings.waitingMessageDelay))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 100 && num <= 2000) {
                        this.plugin.settings.waitingMessageDelay = num;
                        saveSettingsDebounced();
                    }
                }));

        new Setting(containerEl)
            .setName('等待消息切换间隔')
            .setDesc('每条等待消息显示完毕后，多少毫秒后切换到下一条（300-2000）')
            .addText(text => text
                .setPlaceholder('500')
                .setValue(String(this.plugin.settings.waitingMessageInterval))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 300 && num <= 2000) {
                        this.plugin.settings.waitingMessageInterval = num;
                        saveSettingsDebounced();
                    }
                }));

        new Setting(containerEl)
            .setName('等待消息列表')
            .setDesc('AI 等待时显示的文字列表，每行一条')
            .addTextArea(textArea => textArea
                .setPlaceholder('思考中...\n搜索枯肠中...\n绞尽脑汁中...')
                .setValue(this.plugin.settings.waitingMessages.join('\n'))
                .onChange(async (value) => {
                    const messages = value.split('\n').filter(line => line.trim() !== '');
                    if (messages.length > 0) {
                        this.plugin.settings.waitingMessages = messages;
                        saveSettingsDebounced();
                    }
                }));

        new Setting(containerEl)
            .setName('使用项目内容作为等待消息')
            .setDesc('开启后，等待消息将从章节文件夹中随机抽取句子，而非使用预设文字')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useProjectContentAsWaitingMessages ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.useProjectContentAsWaitingMessages = value;
                    await this.plugin.saveSettings();
                    // Refresh chapter sentences when toggled
                    if (value) {
                        await this.plugin.refreshWaitingMessagesFromChapters();
                    }
                }));

        // API 重试配置
        containerEl.createEl('h3', { text: 'API 重试配置' });

        new Setting(containerEl)
            .setName('最大重试次数')
            .setDesc('当 API 请求失败（如空响应、网络错误等）时的最大重试次数（0-10 次）')
            .addSlider(slider => slider
                .setLimits(0, 10, 1)
                .setValue(this.plugin.settings.maxRetries ?? 3)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxRetries = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('重试延迟说明')
            .setDesc('重试将使用指数退避策略：第1次重试等待1秒，第2次等待2秒，第3次等待4秒，以此类推。')
            .setClass('setting-item-description');
    }

    hide(): void {
        if (this.escHandler) {
            const settingsModal = this.containerEl.closest('.modal');
            if (settingsModal) {
                settingsModal.removeEventListener('keydown', this.escHandler, true);
            }
            this.escHandler = null;
        }
    }

    private renderProvidersList(container: HTMLElement) {
        container.empty();

        const providers = this.plugin.settings.providers || [];
        if (providers.length === 0) {
            return;
        }

        providers.forEach((provider: ProviderConfig, index: number) => {
            const providerEl = container.createDiv('provider-item');
            providerEl.style.border = '1px solid var(--background-modifier-border)';
            providerEl.style.borderRadius = '6px';
            providerEl.style.padding = '10px';
            providerEl.style.marginBottom = '10px';
            providerEl.style.backgroundColor = 'var(--background-secondary)';

            new Setting(providerEl)
                .setName(provider.name)
                .setDesc(`${PROVIDER_NAMES[provider.type as ProviderType]} | 模型: ${provider.selectedModel || '未设置'}`)
                .addButton(button => {
                    button
                        .setButtonText('编辑')
                        .setIcon('pencil')
                        .onClick(() => {
                            new ProviderConfigModal(this.app, provider, async (updatedConfig) => {
                                if (this.plugin.settings.providers) {
                                    this.plugin.settings.providers[index] = updatedConfig;
                                    await this.plugin.saveSettings();

                                    // 如果编辑的是当前激活的提供商，重新初始化
                                    if (this.plugin.settings.activeProviderId === updatedConfig.id) {
                                        await this.plugin.aiService.updateSettings(this.plugin.settings);
                                    }

                                    this.display();
                                }
                            }).open();
                        });
                })
                .addButton(button => {
                    button
                        .setButtonText('删除')
                        .setIcon('trash')
                        .setWarning()
                        .onClick(async () => {
                            if (this.plugin.settings.providers) {
                                const confirmed = confirm(`确定要删除提供商 "${provider.name}" 吗？`);
                                if (!confirmed) return;

                                this.plugin.settings.providers.splice(index, 1);

                                // 如果删除的是激活的提供商，清除激活状态或选择第一个
                                if (this.plugin.settings.activeProviderId === provider.id) {
                                    if (this.plugin.settings.providers.length > 0) {
                                        this.plugin.settings.activeProviderId = this.plugin.settings.providers[0].id;
                                    } else {
                                        this.plugin.settings.activeProviderId = undefined;
                                    }
                                }

                                await this.plugin.saveSettings();
                                this.display();
                            }
                        });
                });
        });
    }

}
