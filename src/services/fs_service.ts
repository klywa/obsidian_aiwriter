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

    /**
     * Extract random sentences from chapter files for waiting messages
     * @param chaptersFolderPath - Path to chapters folder
     * @param maxSentences - Maximum number of sentences to extract (default: 20)
     * @param minSentenceLength - Minimum sentence length in characters (default: 5)
     * @param maxSentenceLength - Maximum sentence length in characters (default: 100)
     * @returns Array of random sentences from chapter files
     */
    async extractRandomSentencesFromChapters(
        chaptersFolderPath: string,
        maxSentences: number = 20,
        minSentenceLength: number = 5,
        maxSentenceLength: number = 100
    ): Promise<string[]> {
        const sentences: string[] = [];

        try {
            // Get ALL files recursively from chapters folder (including subdirectories)
            const filePaths = await this.listFilesRecursive(chaptersFolderPath);

            if (filePaths.length === 0) {
                console.warn('[FSService] No files found in chapters folder:', chaptersFolderPath);
                return sentences;
            }

            console.log(`[FSService] Found ${filePaths.length} files in chapters folder`);

            // Convert file paths to TFile objects
            const files: TFile[] = [];
            for (const path of filePaths) {
                const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
                if (file instanceof TFile) {
                    files.push(file);
                }
            }

            // Read content from up to 5 random files to avoid excessive file reading
            const maxFilesToRead = Math.min(files.length, 5);
            const shuffledFiles = [...files].sort(() => Math.random() - 0.5);
            const selectedFiles = shuffledFiles.slice(0, maxFilesToRead);

            console.log(`[FSService] Reading ${selectedFiles.length} random files for sentence extraction`);

            // Chinese sentence terminators - we need to preserve closing quotes
            // Use + to handle continuous punctuation like …… or ！！
            const sentenceTerminators = /[。！？…]+/g;

            for (const file of selectedFiles) {
                try {
                    const content = await this.app.vault.read(file);
                    console.log(`[FSService] Processing file: ${file.path}, content length: ${content.length}`);

                    // Extract sentences with proper quote handling - process line by line
                    const extractedSentences: string[] = [];
                    const lines = content.split('\n');

                    for (const line of lines) {
                        // Skip empty lines (whitespace only)
                        if (!line.trim()) continue;
                        
                        // Skip lines with headings (#) or tables (|) or hr (---)
                        if (line.includes('#') || line.includes('|') || line.startsWith('---')) continue;

                        // Remove stars (*) used for bold/italic
                        const cleanLine = line.replace(/\*/g, '').trim();
                        if (!cleanLine) continue;

                        let lastIndex = 0;
                        let match;
                        // Include ellipsis (…) and handle continuous punctuation
                        sentenceTerminators.lastIndex = 0;

                        while ((match = sentenceTerminators.exec(cleanLine)) !== null) {
                            let endIndex = match.index + match[0].length; // Include the terminator(s)

                            // Check if followed by closing quotes (Chinese or English)
                            const remaining = cleanLine.slice(endIndex);
                            // Match various closing quotes: ” ’ " ' 」 』
                            const quoteMatch = remaining.match(/^([”’"']|」|』)/);

                            if (quoteMatch) {
                                endIndex += quoteMatch[0].length; // Include the closing quote
                                sentenceTerminators.lastIndex = endIndex;
                            }

                            const sentence = cleanLine.slice(lastIndex, endIndex).trim();
                            // Filter out sentences starting with punctuation or too short
                            if (sentence && !/^[。！？,，]/.test(sentence)) {
                                extractedSentences.push(sentence);
                            }
                            lastIndex = endIndex;
                        }

                        // Add any remaining content on this line
                        if (lastIndex < cleanLine.length) {
                            const remaining = cleanLine.slice(lastIndex).trim();
                            if (remaining && !/^[。！？,，]/.test(remaining)) {
                                extractedSentences.push(remaining);
                            }
                        }
                    }

                    console.log(`[FSService] Extracted ${extractedSentences.length} raw sentences from ${file.path}`);

                    // Filter and clean sentences
                    const cleanedSentences = extractedSentences
                        .filter(s => {
                            const length = s.length;
                            return length >= minSentenceLength && length <= maxSentenceLength;
                        })
                        .map(s => {
                            let processed = s;

                            // Auto-complete missing starting quotes if sentence ends with a closing quote
                            const lastChar = processed.slice(-1);
                            const quotePairs: {[key: string]: string} = {
                                '”': '“',
                                '’': '‘',
                                '」': '「',
                                '』': '『',
                                '"': '"',
                                "'": "'"
                            };

                            if (quotePairs[lastChar]) {
                                const startQuote = quotePairs[lastChar];
                                
                                if (lastChar === '"' || lastChar === "'") {
                                    // Non-directional quotes: count occurrences
                                    const count = processed.split(lastChar).length - 1;
                                    if (count % 2 !== 0) {
                                        processed = startQuote + processed;
                                    }
                                } else {
                                    // Directional quotes: compare counts
                                    const startCount = processed.split(startQuote).length - 1;
                                    const endCount = processed.split(lastChar).length - 1;
                                    if (startCount < endCount) {
                                        processed = startQuote + processed;
                                    }
                                }
                            }

                            // Add ellipsis for continuity if not already ending with one
                            return processed + (processed.endsWith('…') ? '' : '…');
                        });

                    console.log(`[FSService] After filtering (length ${minSentenceLength}-${maxSentenceLength}): ${cleanedSentences.length} sentences`);
                    sentences.push(...cleanedSentences);

                    // Stop if we have enough sentences
                    if (sentences.length >= maxSentences) {
                        break;
                    }
                } catch (error) {
                    console.error(`[FSService] Failed to read file ${file.path}:`, error);
                    // Continue with next file
                }
            }

            console.log(`[FSService] Total sentences extracted: ${sentences.length}`);

            // Shuffle and limit to maxSentences
            const shuffledSentences = sentences.sort(() => Math.random() - 0.5);
            return shuffledSentences.slice(0, maxSentences);

        } catch (error) {
            console.error('[FSService] Error extracting sentences from chapters:', error);
            return sentences;
        }
    }

    /**
     * Updates the status field in a .plan.md file's YAML frontmatter.
     * @param planPath - Path to the .plan.md file
     * @param newStatus - New status value: 'draft' | 'confirmed' | 'executed'
     */
    async updatePlanStatus(planPath: string, newStatus: 'draft' | 'confirmed' | 'executed'): Promise<void> {
        const content = await this.readFile(planPath);
        const updated = content.replace(
            /^status:\s*(draft|confirmed|executed)/m,
            `status: ${newStatus}`
        );
        await this.writeFile(planPath, updated);
    }

    /**
     * Replaces the body (content after YAML frontmatter) of a .plan.md file
     * with the user-edited content, preserving the frontmatter.
     */
    async updatePlanContent(planPath: string, newBody: string): Promise<void> {
        const content = await this.readFile(planPath);
        // Split on the closing frontmatter delimiter (second ---)
        const frontmatterEnd = content.indexOf('---', 3);
        if (frontmatterEnd !== -1) {
            const frontmatter = content.slice(0, frontmatterEnd + 3);
            await this.writeFile(planPath, frontmatter + '\n\n' + newBody);
        } else {
            // No frontmatter found — overwrite entirely
            await this.writeFile(planPath, newBody);
        }
    }
}

