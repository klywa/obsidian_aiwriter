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

    async writeFile(path: string, content: string): Promise<string | null> {
        const normalized = normalizePath(path);
        let file = this.app.vault.getAbstractFileByPath(normalized);
        let previousContent: string | null = null;
        
        // Ensure parent directory exists
        const parentDir = normalized.split('/').slice(0, -1).join('/');
        if (parentDir) {
            await this.ensureFolder(parentDir);
        }

        if (file instanceof TFile) {
            previousContent = await this.app.vault.read(file);
            await this.app.vault.modify(file, content);
        } else if (!file) {
            await this.app.vault.create(normalized, content);
        } else {
             throw new Error(`Path ${path} exists but is not a file.`);
        }
        return previousContent;
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

    /**
     * Edit file with line-based operations
     * @param path - File path
     * @param operation - Edit operation type
     * @param startLine - Starting line number (1-based, optional for append)
     * @param endLine - Ending line number (1-based, inclusive, optional for insert/append)
     * @param content - New content (optional for delete)
     * @returns Previous content for undo capability
     */
    async editFile(
        path: string,
        operation: 'replace' | 'insert' | 'delete' | 'append',
        startLine?: number,
        endLine?: number,
        content?: string
    ): Promise<string | null> {
        const normalized = normalizePath(path);
        const file = this.app.vault.getAbstractFileByPath(normalized);

        if (!(file instanceof TFile)) {
            throw new Error(`File ${path} not found. Use writeFile to create new files.`);
        }

        // Read current content
        const fullContent = await this.app.vault.read(file);
        const lines = fullContent.split('\n');

        // Validate line numbers (convert to 0-based for internal use)
        let startIdx: number | undefined;
        let endIdx: number | undefined;

        if (startLine !== undefined) {
            startIdx = startLine - 1; // Convert to 0-based
            if (startIdx < 0 || startIdx >= lines.length) {
                throw new Error(
                    `Invalid startLine: ${startLine}. File only has ${lines.length} lines. ` +
                    `Try readFile first to see current line count.`
                );
            }
        }

        if (endLine !== undefined) {
            endIdx = endLine - 1; // Convert to 0-based
            if (endIdx < 0 || endIdx >= lines.length || (startIdx !== undefined && endIdx < startIdx)) {
                throw new Error(
                    `Invalid endLine: ${endLine}. Must be between ${startLine || 1} and ${lines.length}.`
                );
            }
        }

        // Perform operation
        let newLines: string[];

        switch (operation) {
            case 'replace':
                if (startIdx === undefined || endIdx === undefined || content === undefined) {
                    throw new Error('replace operation requires startLine, endLine, and content');
                }
                newLines = [
                    ...lines.slice(0, startIdx),
                    ...content.split('\n'),
                    ...lines.slice(endIdx + 1)
                ];
                break;

            case 'insert':
                if (startIdx === undefined || content === undefined) {
                    throw new Error('insert operation requires startLine and content');
                }
                newLines = [
                    ...lines.slice(0, startIdx + 1),
                    ...content.split('\n'),
                    ...lines.slice(startIdx + 1)
                ];
                break;

            case 'delete':
                if (startIdx === undefined || endIdx === undefined) {
                    throw new Error('delete operation requires startLine and endLine');
                }
                newLines = [
                    ...lines.slice(0, startIdx),
                    ...lines.slice(endIdx + 1)
                ];
                break;

            case 'append':
                if (content === undefined) {
                    throw new Error('append operation requires content');
                }
                newLines = [
                    ...lines,
                    ...content.split('\n')
                ];
                break;

            default:
                throw new Error(`Unknown operation: ${operation}`);
        }

        // Write modified content
        const newContent = newLines.join('\n');
        await this.app.vault.modify(file, newContent);

        // Refresh open file views to reflect changes immediately
        this.refreshOpenFileView(normalized);

        // Return previous content for undo
        return fullContent;
    }

    /**
     * Refresh the view of an open file to show latest changes
     * @param filePath - Path to the file to refresh
     */
    private refreshOpenFileView(filePath: string): void {
        try {
            const { workspace } = this.app;
            const { MarkdownView } = require('obsidian');

            // Find all leaves displaying this file
            const leavesToRefresh: any[] = [];
            workspace.iterateAllLeaves((leaf: any) => {
                if (leaf.view instanceof MarkdownView &&
                    leaf.view.file?.path === filePath) {
                    leavesToRefresh.push(leaf);
                }
            });

            // Refresh each leaf by re-activating it
            leavesToRefresh.forEach(leaf => {
                // Store current state
                const wasActive = workspace.activeLeaf === leaf;
                const currentMode = leaf.view.getMode?.();

                // Trigger refresh by setting as active (forces reload)
                if (!wasActive) {
                    // If not active, briefly activate and restore
                    const previousActive = workspace.activeLeaf;
                    workspace.setActiveLeaf(leaf, { focus: false });
                    if (previousActive) {
                        workspace.setActiveLeaf(previousActive, { focus: false });
                    }
                } else {
                    // If already active, force a subtle refresh
                    // This will update the content without losing cursor position
                    leaf.view.onLoadFile?.(leaf.view.file);
                }
            });

            if (leavesToRefresh.length > 0) {
                console.log(`[FSService] Refreshed ${leavesToRefresh.length} open view(s) for ${filePath}`);
            }
        } catch (error) {
            console.error('[FSService] Failed to refresh open file view:', error);
            // Non-critical error - don't throw, file was still modified successfully
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
         const normalizedPath = normalizePath(folderPath);
         const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
         
         if (!(folder instanceof TFolder)) {
             console.warn(`Folder not found or not a folder: ${folderPath}`);
             return [];
         }
         
         let files: TFile[] = [];
         // Simple recursive walker
         const walk = (item: any) => {
             if (item instanceof TFile) {
                 files.push(item);
             } else if (item instanceof TFolder) {
                 for (const child of item.children) {
                     walk(child);
                 }
             }
         }
         walk(folder);
         console.log(`📂 Found ${files.length} files in ${folderPath}`);
         return files.map(f => f.path);
    }
    
    async listFilesRecursiveWithMtime(folderPath: string): Promise<Array<{path: string, mtime: number}>> {
         const normalizedPath = normalizePath(folderPath);
         const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
         
         if (!(folder instanceof TFolder)) {
             console.warn(`Folder not found or not a folder: ${folderPath}`);
             return [];
         }
         
         let files: Array<{path: string, mtime: number}> = [];
         // Simple recursive walker
         const walk = (item: any) => {
             if (item instanceof TFile) {
                 files.push({
                     path: item.path,
                     mtime: item.stat.mtime
                 });
             } else if (item instanceof TFolder) {
                 for (const child of item.children) {
                     walk(child);
                 }
             }
         }
         walk(folder);
         console.log(`📂 Found ${files.length} files in ${folderPath}`);
         return files;
    }
}

