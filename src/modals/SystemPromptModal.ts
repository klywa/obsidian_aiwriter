import { App, Setting } from "obsidian";
import { BaseModal } from "./BaseModal";

export class SystemPromptModal extends BaseModal {
    private prompt: string;
    private onSave: (prompt: string) => void;
    private textAreaEl: HTMLTextAreaElement;
    private readOnly: boolean;

    constructor(app: App, prompt: string, onSave: (prompt: string) => void, readOnly: boolean = false) {
        super(app);
        this.prompt = prompt;
        this.onSave = onSave;
        this.readOnly = readOnly;
    }

    onOpen() {
        super.onOpen();
        const { contentEl } = this;

        contentEl.empty();
        contentEl.addClass('system-prompt-modal');

        // Title
        contentEl.createEl('h2', {
            text: this.readOnly ? '核心系统指令 (只读)' : 'Edit System Prompt'
        });

        // Description
        contentEl.createEl('p', {
            text: this.readOnly
                ? '插件内置的核心指令，包含所有工具使用指导等。此部分不可编辑，确保 AI 始终正确使用工具。'
                : 'Define the core instructions for the AI Agent.',
            cls: 'setting-item-description'
        });
        
        // Text Area Container
        const textAreaContainer = contentEl.createDiv('system-prompt-textarea-container');
        this.textAreaEl = textAreaContainer.createEl('textarea', {
            cls: 'system-prompt-textarea',
            attr: {
                rows: '20',
                placeholder: 'Enter system prompt...'
            }
        });
        this.textAreaEl.value = this.prompt;

        // Disable editing in read-only mode
        if (this.readOnly) {
            this.textAreaEl.disabled = true;
            this.textAreaEl.style.cursor = 'default';
            this.textAreaEl.style.backgroundColor = 'var(--background-secondary)';
        }
        
        // Buttons Container
        const buttonContainer = contentEl.createDiv('system-prompt-button-container');

        if (this.readOnly) {
            // Read-only mode: only show Close button
            const closeBtn = buttonContainer.createEl('button', {
                text: '关闭',
                cls: 'mod-cta'
            });
            closeBtn.addEventListener('click', () => {
                this.close();
            });
        } else {
            // Editable mode: show Save and Cancel buttons
            // Save Button
            const saveBtn = buttonContainer.createEl('button', {
                text: 'Save',
                cls: 'mod-cta'
            });
            saveBtn.addEventListener('click', () => {
                this.onSave(this.textAreaEl.value);
                this.close();
            });

            // Cancel Button
            const cancelBtn = buttonContainer.createEl('button', {
                text: 'Cancel'
            });
            cancelBtn.addEventListener('click', () => {
                this.close();
            });

            // Focus on text area
            this.textAreaEl.focus();
        }
    }

    onClose() {
        super.onClose();
        const { contentEl } = this;
        contentEl.empty();
    }
}











