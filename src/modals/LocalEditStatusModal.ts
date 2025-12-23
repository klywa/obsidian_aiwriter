import { App, Modal } from "obsidian";

export class LocalEditStatusModal extends Modal {
    private isActive: boolean = false;
    private statusText: string = "正在生成修改...";
    private statusEl: HTMLElement | null = null;

    constructor(app: App) {
        super(app);
        this.modalEl.addClass("local-edit-status-modal");
    }

    onOpen() {
        this.isActive = true;
        const { contentEl } = this;
        contentEl.empty();
        
        // Status icon and text
        const statusContainer = contentEl.createDiv({ cls: "local-edit-status-content" });
        
        // Loading spinner
        const spinner = statusContainer.createDiv({ cls: "local-edit-spinner" });
        
        // Status text
        this.statusEl = statusContainer.createDiv({
            cls: "local-edit-status-text",
            text: this.statusText
        });

        // Cancel button
        const cancelBtn = contentEl.createEl('button', {
            text: '取消',
            cls: 'local-edit-cancel-btn'
        });
        cancelBtn.onclick = () => {
            const plugin = (this.app as any).plugins.plugins['voyaru-plugin'];
            if (plugin && plugin.cancelLocalEdit) {
                plugin.cancelLocalEdit();
            }
            this.close();
        };
    }

    onClose() {
        this.isActive = false;
        this.statusEl = null;
    }

    updateStatus(text: string) {
        this.statusText = text;
        if (this.isActive && this.statusEl) {
            this.statusEl.setText(this.statusText);
        }
    }

    setActive(active: boolean) {
        this.isActive = active;
        if (active) {
            this.open();
        } else {
            this.close();
        }
    }
}
