import { ItemView, WorkspaceLeaf } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { AnnotationPanelComponent } from './AnnotationView';
import type VoyaruPlugin from '../main';

export const VIEW_TYPE_ANNOTATION = 'voyaru-annotation-view';

export class AnnotationView extends ItemView {
    private root: Root | null = null;
    plugin: VoyaruPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: VoyaruPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_ANNOTATION;
    }

    getDisplayText(): string {
        return '批注面板';
    }

    getIcon(): string {
        return 'message-square';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        this.root = createRoot(container);
        this.root.render(
            React.createElement(AnnotationPanelComponent, { plugin: this.plugin, view: this })
        );
    }

    async onClose() {
        this.root?.unmount();
        this.root = null;
    }
}
