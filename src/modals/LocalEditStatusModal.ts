import { App, Modal } from "obsidian";

export class LocalEditStatusModal extends Modal {
    private isActive: boolean = false;
    private statusText: string = "正在修改中...";

    constructor(app: App) {
        super(app);
        this.modalEl.addClass("local-edit-status-modal");
        this.modalEl.style.width = "300px";
        this.modalEl.style.height = "auto";
    }

    onOpen() {
        this.isActive = true;
        this.updateContent();
        // 添加取消按钮
        const { contentEl } = this;
        const cancelBtn = contentEl.createEl('button', {
            text: '取消',
            cls: 'mod-cta'
        });
        cancelBtn.style.marginTop = '8px';
        cancelBtn.style.padding = '4px 12px';
        cancelBtn.style.fontSize = '12px';
        cancelBtn.onclick = () => {
            // 通过plugin实例调用取消方法
            const plugin = (this.app as any).plugins.plugins['voyaru-plugin'];
            if (plugin && plugin.cancelLocalEdit) {
                plugin.cancelLocalEdit();
            }
            this.close();
        };
    }

    onClose() {
        this.isActive = false;
    }

    updateStatus(text: string) {
        this.statusText = text;
        if (this.isActive) {
            this.updateContent();
        }
    }

    private updateContent() {
        const { contentEl } = this;
        contentEl.empty();
        
        const container = contentEl.createDiv({
            cls: "local-edit-status-container",
            text: this.statusText
        });
        
        container.style.padding = "16px";
        container.style.textAlign = "center";
        container.style.fontSize = "14px";
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

