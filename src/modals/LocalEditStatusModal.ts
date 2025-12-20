import { App, Modal } from "obsidian";

export class LocalEditStatusModal extends Modal {
    private isActive: boolean = false;
    private statusText: string = "正在修改中...";
    private statusContainerEl: HTMLElement | null = null;

    constructor(app: App) {
        super(app);
        this.modalEl.addClass("local-edit-status-modal");
        this.modalEl.style.width = "300px";
        this.modalEl.style.height = "auto";
    }

    onOpen() {
        this.isActive = true;
        const { contentEl } = this;
        contentEl.empty();
        
        this.statusContainerEl = contentEl.createDiv({
            cls: "local-edit-status-container",
            text: this.statusText
        });
        
        this.statusContainerEl.style.padding = "16px";
        this.statusContainerEl.style.textAlign = "center";
        this.statusContainerEl.style.fontSize = "14px";

        // 添加取消按钮
        const btnContainer = contentEl.createDiv();
        btnContainer.style.textAlign = 'center';
        btnContainer.style.paddingBottom = '10px';

        const cancelBtn = btnContainer.createEl('button', {
            text: '取消',
            cls: 'mod-cta'
        });
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
        this.statusContainerEl = null;
    }

    updateStatus(text: string) {
        this.statusText = text;
        if (this.isActive && this.statusContainerEl) {
            this.statusContainerEl.setText(this.statusText);
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

