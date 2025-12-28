import { App, Modal, Notice, Setting, TFolder } from "obsidian";
import { VoyaruSettings } from "../settings";
import { FolderSuggestModal } from "../components/FolderSuggest";

export class FolderConfigModal extends Modal {
    private settings: VoyaruSettings;
    private onSave: (folders: VoyaruSettings['folders']) => void;
    private tempFolders: VoyaruSettings['folders'];

    constructor(
        app: App, 
        settings: VoyaruSettings, 
        onSave: (folders: VoyaruSettings['folders']) => void
    ) {
        super(app);
        this.settings = settings;
        this.onSave = onSave;
        // 创建临时副本
        this.tempFolders = { ...settings.folders };
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.empty();
        contentEl.addClass('folder-config-modal');
        
        // Title
        const header = contentEl.createDiv('folder-config-header');
        header.createEl('h2', { text: '文件夹配置' });
        header.createEl('p', { 
            text: '配置各类文件的存储位置',
            cls: 'folder-config-description'
        });
        
        // Main container
        const mainContainer = contentEl.createDiv('folder-config-main');
        
        // Folder settings
        this.addFolderSetting(mainContainer, '章节文件夹', 'chapters', 
            '存放小说正文章节');
        
        this.addFolderSetting(mainContainer, '角色文件夹', 'characters', 
            '存放角色设定文档');
        
        this.addFolderSetting(mainContainer, '大纲文件夹', 'outlines', 
            '存放故事大纲和细纲');
        
        this.addFolderSetting(mainContainer, '笔记文件夹', 'notes', 
            '存放灵感、素材等笔记');
        
        this.addFolderSetting(mainContainer, '知识库文件夹', 'knowledge', 
            '存放世界设定、风格指南等');
        
        // Bottom buttons
        const buttonContainer = contentEl.createDiv('folder-config-buttons');
        
        const saveBtn = buttonContainer.createEl('button', {
            text: '保存',
            cls: 'mod-cta'
        });
        saveBtn.addEventListener('click', () => {
            this.onSave(this.tempFolders);
            new Notice('文件夹配置已保存');
            this.close();
        });
        
        const cancelBtn = buttonContainer.createEl('button', {
            text: '取消'
        });
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }

    private addFolderSetting(
        container: HTMLElement, 
        name: string, 
        key: keyof VoyaruSettings['folders'],
        description: string
    ) {
        const settingItem = container.createDiv('folder-config-item');
        
        const labelContainer = settingItem.createDiv('folder-config-label');
        labelContainer.createEl('div', { text: name, cls: 'folder-config-name' });
        labelContainer.createEl('div', { text: description, cls: 'folder-config-desc' });
        
        const controlContainer = settingItem.createDiv('folder-config-control');
        
        const pathInput = controlContainer.createEl('input', {
            type: 'text',
            value: this.tempFolders[key],
            cls: 'folder-config-input',
            attr: { readonly: 'readonly' }
        });
        
        const browseBtn = controlContainer.createEl('button', {
            text: '浏览...',
            cls: 'folder-config-browse-btn'
        });
        browseBtn.addEventListener('click', () => {
            new FolderSuggestModal(
                this.app,
                async (folder: TFolder) => {
                    const folderPath = folder.path === '/' ? '' : folder.path;
                    this.tempFolders[key] = folderPath;
                    pathInput.value = folderPath;
                }
            ).open();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

