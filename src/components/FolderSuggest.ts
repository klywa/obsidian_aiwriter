import { App, TFolder, FuzzySuggestModal, TAbstractFile } from "obsidian";

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
    private folders: TFolder[];
    private onChoose: (folder: TFolder) => void;

    constructor(app: App, onChoose: (folder: TFolder) => void) {
        super(app);
        this.onChoose = onChoose;
        this.folders = this.getAllFolders();
        
        // Set placeholder
        this.setPlaceholder('Type folder name or create new folder...');
    }

    private getAllFolders(): TFolder[] {
        const folders: TFolder[] = [];
        const rootFolder = this.app.vault.getRoot();
        
        const traverse = (folder: TFolder) => {
            folders.push(folder);
            folder.children.forEach(child => {
                if (child instanceof TFolder) {
                    traverse(child);
                }
            });
        };
        
        traverse(rootFolder);
        return folders;
    }

    getItems(): TFolder[] {
        return this.folders;
    }

    getItemText(folder: TFolder): string {
        return folder.path === '/' ? '/' : folder.path;
    }

    onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(folder);
    }

    onNoSuggestion(): void {
        // Show option to create new folder
        const inputValue = (this.inputEl as HTMLInputElement).value;
        if (inputValue) {
            this.resultContainerEl.empty();
            const createOption = this.resultContainerEl.createDiv('suggestion-item');
            createOption.addClass('is-selected');
            createOption.createEl('div', {
                text: `Create new folder: "${inputValue}"`,
                cls: 'suggestion-content'
            });
            createOption.addEventListener('click', async () => {
                await this.createFolder(inputValue);
            });
        }
    }

    private async createFolder(path: string) {
        try {
            // Normalize path
            path = path.trim().replace(/^\/+|\/+$/g, '');
            
            if (!path) {
                return;
            }
            
            // Check if folder already exists
            const existing = this.app.vault.getAbstractFileByPath(path);
            if (existing) {
                if (existing instanceof TFolder) {
                    this.onChoose(existing);
                    this.close();
                    return;
                }
            }
            
            // Create folder
            const newFolder = await this.app.vault.createFolder(path);
            this.onChoose(newFolder);
            this.close();
        } catch (error) {
            console.error('Error creating folder:', error);
        }
    }
}





