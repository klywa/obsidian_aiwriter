import { App, Modal, Setting } from 'obsidian';

/**
 * Modal for manually adding an annotation to the current file.
 * Opens when user right-clicks selected text → "添加批注".
 */
export class AddAnnotationModal extends Modal {
    private selectedText: string;
    private onSubmit: (suggestion: string, type: 'local' | 'global') => void;
    private suggestionValue = '';
    private typeValue: 'local' | 'global' = 'local';

    constructor(
        app: App,
        selectedText: string,
        onSubmit: (suggestion: string, type: 'local' | 'global') => void
    ) {
        super(app);
        this.selectedText = selectedText;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('voyaru-add-annotation-modal');

        contentEl.createEl('h3', { text: '添加批注' });

        if (this.selectedText) {
            const preview = contentEl.createEl('div', { cls: 'voyaru-annotation-target-preview' });
            preview.createEl('span', { text: '批注段落：', cls: 'voyaru-annotation-label' });
            preview.createEl('span', { text: this.selectedText.substring(0, 100) + (this.selectedText.length > 100 ? '...' : ''), cls: 'voyaru-annotation-target-text' });
        }

        new Setting(contentEl)
            .setName('批注类型')
            .setDesc('局部：仅修改该段落；全文：对全文的整体要求')
            .addDropdown(drop => drop
                .addOption('local', '局部修改')
                .addOption('global', '全文要求')
                .setValue(this.typeValue)
                .onChange(val => { this.typeValue = val as 'local' | 'global'; })
            );

        new Setting(contentEl)
            .setName('修改建议')
            .setDesc('描述你希望如何修改，或对全文的要求');

        const textarea = contentEl.createEl('textarea', {
            cls: 'voyaru-annotation-suggestion-input',
            attr: { rows: '4', placeholder: '例如：这段描写过于平淡，希望增加更多感官细节...' }
        });
        textarea.addEventListener('input', () => { this.suggestionValue = textarea.value; });
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.submit();
            }
        });
        setTimeout(() => textarea.focus(), 50);

        const btnRow = contentEl.createEl('div', { cls: 'voyaru-annotation-modal-buttons' });

        const submitBtn = btnRow.createEl('button', { text: '添加批注', cls: 'mod-cta' });
        submitBtn.addEventListener('click', () => this.submit());

        const cancelBtn = btnRow.createEl('button', { text: '取消' });
        cancelBtn.addEventListener('click', () => this.close());
    }

    private submit() {
        const suggestion = this.suggestionValue.trim();
        if (!suggestion) return;
        this.onSubmit(suggestion, this.typeValue);
        this.close();
    }

    onClose() {
        this.contentEl.empty();
    }
}
