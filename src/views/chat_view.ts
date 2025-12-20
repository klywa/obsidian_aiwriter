import { ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import { ChatComponent } from "./ChatComponent";
import * as React from "react";

export const VIEW_TYPE_CHAT = "voyaru-chat-view";

export class ChatView extends ItemView {
    root: Root | null = null;
    plugin: any;
    private addContextHandler: ((data: any) => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: any) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText() {
        return "Voyaru Agent";
    }

    getIcon() {
        return "bot";
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        
        // 事件监听已经在main.ts中通过CustomEvent直接发送到containerEl
        // 这里不需要额外的事件处理器
        
        this.root = createRoot(container);
        this.root.render(React.createElement(ChatComponent, { plugin: this.plugin, containerEl: container }));
    }

    async onClose() {
        // 在视图关闭前，确保保存所有sessions
        // 通过触发React组件的清理函数来保存
        // 注意：React组件的useEffect清理函数会在unmount时自动调用
        this.root?.unmount();
        this.addContextHandler = null;
    }
}

