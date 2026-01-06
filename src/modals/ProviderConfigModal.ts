import { App, Modal, Setting, Notice } from "obsidian";
import { ProviderConfig, ProviderType } from "../settings";
import { createAdapter, ModelInfo, PROVIDER_NAMES } from "../services/adapters";

export class ProviderConfigModal extends Modal {
    private config: ProviderConfig;
    private onSave: (config: ProviderConfig) => void;
    private isNew: boolean;
    private contentContainer: HTMLElement;

    constructor(
        app: App,
        config: ProviderConfig | null,
        onSave: (config: ProviderConfig) => void
    ) {
        super(app);
        this.isNew = config === null;
        this.config = config || {
            id: crypto.randomUUID(),
            type: 'gemini',
            name: '',
            apiKey: '',
            models: [],
            selectedModel: ''
        };
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.isNew ? "添加 AI 提供商" : "编辑 AI 提供商" });

        this.contentContainer = contentEl.createDiv();
        this.renderForm();
    }

    private renderForm() {
        this.contentContainer.empty();

        // 提供商类型选择
        new Setting(this.contentContainer)
            .setName("提供商类型")
            .setDesc("选择 AI 提供商")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('gemini', PROVIDER_NAMES['gemini'])
                    .addOption('openai', PROVIDER_NAMES['openai'])
                    .addOption('anthropic', PROVIDER_NAMES['anthropic'])
                    .addOption('deepseek', PROVIDER_NAMES['deepseek'])
                    .addOption('custom', PROVIDER_NAMES['custom'])
                    .setValue(this.config.type)
                    .onChange(value => {
                        this.config.type = value as ProviderType;
                        // 清除之前获取的模型列表
                        this.config.models = [];
                        this.config.selectedModel = '';
                        this.renderForm(); // 重新渲染以更新UI
                    });
            });

        // 显示名称
        new Setting(this.contentContainer)
            .setName("显示名称")
            .setDesc("为此提供商设置一个自定义名称（例如：我的 GPT-4）")
            .addText(text => {
                text
                    .setPlaceholder("我的 AI 助手")
                    .setValue(this.config.name)
                    .onChange(value => {
                        this.config.name = value;
                    });
            });

        // API Key
        new Setting(this.contentContainer)
            .setName("API Key")
            .setDesc("输入此提供商的 API 密钥")
            .addText(text => {
                text
                    .setPlaceholder("sk-...")
                    .setValue(this.config.apiKey)
                    .onChange(value => {
                        this.config.apiKey = value;
                    });
                text.inputEl.type = 'password';
            });

        // Base URL（可选）
        const baseURLSetting = new Setting(this.contentContainer)
            .setName("Base URL（可选）")
            .setDesc("API 端点地址（用于自定义提供商或代理）")
            .addText(text => {
                text
                    .setPlaceholder("https://api.openai.com/v1")
                    .setValue(this.config.baseURL || '')
                    .onChange(value => {
                        this.config.baseURL = value;
                    });
            });

        // 对于 DeepSeek，显示默认 URL 提示
        if (this.config.type === 'deepseek') {
            baseURLSetting.setDesc("DeepSeek 默认地址: https://api.deepseek.com/v1（留空使用默认值）");
        } else if (this.config.type === 'custom') {
            baseURLSetting.setDesc("⚠️ 自定义提供商必须配置 Base URL");
        }

        // 获取模型列表按钮
        new Setting(this.contentContainer)
            .setName("获取模型列表")
            .setDesc("从提供商自动获取可用模型（需要先输入 API Key）")
            .addButton(button => {
                button
                    .setButtonText("获取模型")
                    .onClick(async () => {
                        await this.fetchModels();
                    });
            });

        // 显示已获取的模型
        if (this.config.models && this.config.models.length > 0) {
            new Setting(this.contentContainer)
                .setName("选择模型")
                .setDesc(`已获取 ${this.config.models.length} 个模型`)
                .addDropdown(dropdown => {
                    this.config.models!.forEach(model => {
                        dropdown.addOption(model.id, model.name);
                    });
                    dropdown
                        .setValue(this.config.selectedModel || '')
                        .onChange(value => {
                            this.config.selectedModel = value;
                        });
                });
        } else if (this.config.selectedModel) {
            // 如果没有模型列表但有选中的模型（可能是手动输入的）
            new Setting(this.contentContainer)
                .setName("模型 ID")
                .setDesc("当前模型：" + this.config.selectedModel)
                .addText(text => {
                    text
                        .setValue(this.config.selectedModel || '')
                        .onChange(value => {
                            this.config.selectedModel = value;
                        });
                });
        } else {
            // 允许手动输入模型ID
            new Setting(this.contentContainer)
                .setName("模型 ID（可选）")
                .setDesc("如果无法自动获取，可以手动输入模型 ID")
                .addText(text => {
                    text
                        .setPlaceholder("gpt-4o")
                        .setValue(this.config.selectedModel || '')
                        .onChange(value => {
                            this.config.selectedModel = value;
                        });
                });
        }

        // 保存和取消按钮
        const buttonContainer = this.contentContainer.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginTop = '20px';

        const saveButton = buttonContainer.createEl('button', { text: '保存', cls: 'mod-cta' });
        saveButton.addEventListener('click', () => {
            this.handleSave();
        });

        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }

    private async fetchModels() {
        if (!this.config.apiKey || this.config.apiKey.trim().length === 0) {
            new Notice("请先输入 API Key");
            return;
        }

        // 对于自定义提供商，必须配置 Base URL
        if (this.config.type === 'custom' && !this.config.baseURL) {
            new Notice("自定义提供商需要配置 Base URL");
            return;
        }

        const notice = new Notice("正在获取模型列表...", 0);

        try {
            const adapter = createAdapter(this.config.type, {
                apiKey: this.config.apiKey,
                baseURL: this.config.baseURL,
                model: '' // 临时占位
            });

            await adapter.initClient();
            const models = await adapter.fetchAvailableModels();

            this.config.models = models;

            // 如果之前没有选中模型，自动选择第一个
            if (models.length > 0 && !this.config.selectedModel) {
                this.config.selectedModel = models[0]?.id || '';
            }

            notice.hide();
            new Notice(`成功获取 ${models.length} 个模型`);

            // 重新渲染表单以显示模型列表
            this.renderForm();
        } catch (e: any) {
            notice.hide();
            console.error('Failed to fetch models:', e);
            new Notice(`获取模型失败: ${e.message}`);
        }
    }

    private handleSave() {
        // 验证必填字段
        if (!this.config.name || this.config.name.trim().length === 0) {
            new Notice("请输入显示名称");
            return;
        }

        if (!this.config.apiKey || this.config.apiKey.trim().length === 0) {
            new Notice("请输入 API Key");
            return;
        }

        if (this.config.type === 'custom' && !this.config.baseURL) {
            new Notice("自定义提供商需要配置 Base URL");
            return;
        }

        if (!this.config.selectedModel || this.config.selectedModel.trim().length === 0) {
            new Notice("请选择或输入模型 ID");
            return;
        }

        // 保存配置
        this.onSave(this.config);
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
