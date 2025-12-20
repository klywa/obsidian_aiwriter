import { App, TFile, TFolder, normalizePath } from "obsidian";

export class FSService {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    async ensureFolder(path: string) {
        const normalized = normalizePath(path);
        const parts = normalized.split("/");
        let currentPath = "";
        for (const part of parts) {
            currentPath = currentPath === "" ? part : `${currentPath}/${part}`;
            const file = this.app.vault.getAbstractFileByPath(currentPath);
            if (!file) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    async writeFile(path: string, content: string) {
        const normalized = normalizePath(path);
        let file = this.app.vault.getAbstractFileByPath(normalized);
        
        // Ensure parent directory exists
        const parentDir = normalized.split('/').slice(0, -1).join('/');
        if (parentDir) {
            await this.ensureFolder(parentDir);
        }

        if (file instanceof TFile) {
            await this.app.vault.modify(file, content);
        } else if (!file) {
            await this.app.vault.create(normalized, content);
        } else {
             throw new Error(`Path ${path} exists but is not a file.`);
        }
    }

    async readFile(path: string): Promise<string> {
        const normalized = normalizePath(path);
        const file = this.app.vault.getAbstractFileByPath(normalized);
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        throw new Error(`File ${path} not found.`);
    }

    async deleteFile(path: string) {
        const normalized = normalizePath(path);
        const file = this.app.vault.getAbstractFileByPath(normalized);
        if (file) {
             // Move to system trash
             await this.app.vault.trash(file, true); 
        }
    }
    
    getFiles(folderPath: string): TFile[] {
         const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
         if (folder instanceof TFolder) {
             return folder.children.filter(c => c instanceof TFile) as TFile[];
         }
         return [];
    }

    async listFilesRecursive(folderPath: string): Promise<string[]> {
         const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
         if (!(folder instanceof TFolder)) return [];
         
         let files: string[] = [];
         // Simple recursive walker
         const walk = (item: any) => {
             if (item instanceof TFile) {
                 files.push(item.path);
             } else if (item instanceof TFolder) {
                 for (const child of item.children) {
                     walk(child);
                 }
             }
         }
         walk(folder);
         return files;
    }
}

