import { App, Component, Modal, Platform, Setting } from 'obsidian';

/**
 * Modal for manually adding an annotation to the current file.
 * Opens when user right-clicks selected text → "添加批注".
 */
export class AddAnnotationModal extends Modal {
    private selectedText: string;
    private onSubmit: (suggestion: string, type: 'local' | 'global') => void;
    private suggestionValue = '';
    private typeValue: 'local' | 'global' = 'global';
    private lifecycle?: Component;

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
        const lifecycle = new Component();
        lifecycle.load();
        this.lifecycle = lifecycle;
        contentEl.empty();
        contentEl.addClass('voyaru-add-annotation-modal');
        this.modalEl.addClass('voyaru-annotation-dialog');
        if (Platform.isMobile) this.containerEl.addClass('voyaru-annotation-mobile-container');

        contentEl.createEl('h3', { text: '添加批注' });
        const body = contentEl.createDiv({ cls: 'voyaru-annotation-modal-body' });

        if (this.selectedText) {
            const preview = body.createEl('div', { cls: 'voyaru-annotation-target-preview' });
            preview.createEl('span', { text: '批注段落：', cls: 'voyaru-annotation-label' });
            preview.createEl('span', { text: this.selectedText.substring(0, 100) + (this.selectedText.length > 100 ? '...' : ''), cls: 'voyaru-annotation-target-text' });
        }

        new Setting(body)
            .setName('批注类型')
            .setDesc('局部：仅修改该段落；全文：对全文的整体要求')
            .addDropdown(drop => drop
                .addOption('local', '局部修改')
                .addOption('global', '全文要求')
                .setValue(this.typeValue)
                .onChange(val => { this.typeValue = val as 'local' | 'global'; })
            );

        new Setting(body)
            .setName('修改建议')
            .setDesc('描述你希望如何修改，或对全文的要求');

        const textarea = body.createEl('textarea', {
            cls: 'voyaru-annotation-suggestion-input',
            attr: { rows: '4', placeholder: '例如：这段描写过于平淡，希望增加更多感官细节...' }
        });
        textarea.value = this.suggestionValue;
        lifecycle.registerDomEvent(textarea, 'input', () => { this.suggestionValue = textarea.value; });
        lifecycle.registerDomEvent(textarea, 'keydown', (e) => {
            if (!e.isComposing && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.submit();
            }
        });
        this.trackViewport(lifecycle, body, textarea);

        const btnRow = contentEl.createEl('div', { cls: 'voyaru-annotation-modal-buttons' });

        const submitBtn = btnRow.createEl('button', { text: '添加批注', cls: 'mod-cta' });
        lifecycle.registerDomEvent(submitBtn, 'click', () => this.submit());

        const cancelBtn = btnRow.createEl('button', { text: '取消' });
        lifecycle.registerDomEvent(cancelBtn, 'click', () => this.close());
    }

    private trackViewport(lifecycle: Component, body: HTMLElement, textarea: HTMLTextAreaElement) {
        const win = this.contentEl.ownerDocument.defaultView;
        if (!win) return;
        const viewport = win.visualViewport;
        let frame: number | undefined;
        const update = () => {
            frame = undefined;
            this.containerEl.style.setProperty('--voyaru-viewport-height', `${viewport?.height ?? win.innerHeight}px`);
            this.containerEl.style.setProperty('--voyaru-viewport-top', `${viewport?.offsetTop ?? 0}px`);
            if (this.contentEl.ownerDocument.activeElement === textarea) {
                const inputRect = textarea.getBoundingClientRect();
                const bodyRect = body.getBoundingClientRect();
                // Scroll only our body; scrolling the page can move the modal behind the keyboard.
                if (inputRect.top < bodyRect.top) body.scrollTop += inputRect.top - bodyRect.top;
                else if (inputRect.bottom > bodyRect.bottom) {
                    body.scrollTop += Math.min(inputRect.bottom - bodyRect.bottom, inputRect.top - bodyRect.top);
                }
            }
        };
        const scheduleUpdate = () => {
            if (frame === undefined) frame = win.requestAnimationFrame(update);
        };
        lifecycle.registerDomEvent(win, 'resize', scheduleUpdate);
        lifecycle.registerDomEvent(textarea, 'focus', scheduleUpdate);
        if (viewport) {
            viewport.addEventListener('resize', scheduleUpdate);
            viewport.addEventListener('scroll', scheduleUpdate);
            lifecycle.register(() => {
                viewport.removeEventListener('resize', scheduleUpdate);
                viewport.removeEventListener('scroll', scheduleUpdate);
            });
        }
        update();
        const focusTimer = win.setTimeout(() => {
            textarea.focus({ preventScroll: true });
            scheduleUpdate();
        }, 50);
        lifecycle.register(() => {
            win.clearTimeout(focusTimer);
            if (frame !== undefined) win.cancelAnimationFrame(frame);
        });
    }

    private submit() {
        const suggestion = this.suggestionValue.trim();
        if (!suggestion) return;
        this.onSubmit(suggestion, this.typeValue);
        this.close();
    }

    onClose() {
        this.lifecycle?.unload();
        this.lifecycle = undefined;
        this.containerEl.removeClass('voyaru-annotation-mobile-container');
        this.containerEl.style.removeProperty('--voyaru-viewport-height');
        this.containerEl.style.removeProperty('--voyaru-viewport-top');
        this.contentEl.empty();
    }
}
