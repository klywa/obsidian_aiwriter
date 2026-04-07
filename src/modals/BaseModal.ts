// src/modals/BaseModal.ts
import { App, Modal } from 'obsidian';

export class BaseModal extends Modal {
    private _escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
        }
    };

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        // Remove before adding to avoid duplicates on re-render calls
        this.containerEl.removeEventListener('keydown', this._escHandler, true);
        this.containerEl.addEventListener('keydown', this._escHandler, true);
    }

    onClose() {
        this.containerEl.removeEventListener('keydown', this._escHandler, true);
    }
}
