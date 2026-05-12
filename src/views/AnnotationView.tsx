import React, { useState, useEffect, useCallback, useRef } from 'react';
import type VoyaruPlugin from '../main';
import type { AnnotationView } from './annotation_view';
import { parseAnnotations, removeAnnotationFromText, writeAnnotationBlock, addAnnotationToText } from '../editor/annotation_parser';
import type { Annotation } from '../editor/annotation_parser';
import { AnnotationCard } from '../components/AnnotationCard';
import { Notice, MarkdownView } from 'obsidian';
import { VIEW_TYPE_CHAT } from './chat_view';
import { EditorView, Decoration } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';

// CM6 flash highlight — registered once per editor instance
const addFlashEffect = StateEffect.define<{ from: number; to: number }>();
const clearFlashEffect = StateEffect.define<null>();
const flashField = StateField.define<any>({
    create() { return Decoration.none; },
    update(decos: any, tr: any) {
        for (const e of tr.effects) {
            if (e.is(addFlashEffect)) {
                return Decoration.set([
                    Decoration.mark({ class: 'voyaru-annotation-flash' })
                        .range(e.value.from, e.value.to)
                ]);
            }
            if (e.is(clearFlashEffect)) return Decoration.none;
        }
        return decos;
    },
    provide: (f: any) => EditorView.decorations.from(f)
});

function flashHighlight(cmView: EditorView, from: number, to: number) {
    if (!(cmView as any)._voyaruFlashInstalled) {
        cmView.dispatch({ effects: StateEffect.appendConfig.of(flashField) });
        (cmView as any)._voyaruFlashInstalled = true;
    }
    cmView.dispatch({ effects: addFlashEffect.of({ from, to }) });
    setTimeout(() => {
        try { cmView.dispatch({ effects: clearFlashEffect.of(null) }); } catch (_) { /* editor closed */ }
    }, 1500);
}

interface Props {
    plugin: VoyaruPlugin;
    view: AnnotationView;
}

export const AnnotationPanelComponent: React.FC<Props> = ({ plugin, view }) => {
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
    const [activeAnnId, setActiveAnnId] = useState<string | null>(null);
    const [editingAnn, setEditingAnn] = useState<Annotation | null>(null);
    const [editValue, setEditValue] = useState('');
    const refreshTimeout = useRef<number | null>(null);

    const refreshAnnotations = useCallback(() => {
        const activeFile = plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            setAnnotations([]);
            setCurrentFilePath(null);
            return;
        }
        setCurrentFilePath(activeFile.path);
        plugin.app.vault.read(activeFile).then(content => {
            const { annotations: parsed } = parseAnnotations(content);
            setAnnotations(parsed);
        }).catch(() => setAnnotations([]));
    }, [plugin]);

    // Refresh on mount, active file change, and editor changes
    useEffect(() => {
        refreshAnnotations();

        const onActiveLeaf = plugin.app.workspace.on('active-leaf-change', () => {
            refreshAnnotations();
            setActiveAnnId(null);
        });

        const onFileModify = plugin.app.vault.on('modify', (file) => {
            const activeFile = plugin.app.workspace.getActiveFile();
            if (activeFile && file.path === activeFile.path) {
                if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
                refreshTimeout.current = window.setTimeout(refreshAnnotations, 500);
            }
        });

        return () => {
            plugin.app.workspace.offref(onActiveLeaf);
            plugin.app.vault.offref(onFileModify);
            if (refreshTimeout.current) clearTimeout(refreshTimeout.current);
        };
    }, [refreshAnnotations, plugin]);

    const applyAnnotation = async (ann: Annotation) => {
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return;

        const content = await plugin.app.vault.read(file);

        if (ann.type === 'local') {
            // Direct text replacement
            if (!ann.target) {
                new Notice('局部批注缺少目标文本，请检查批注内容');
                return;
            }
            if (!content.includes(ann.target)) {
                new Notice(`找不到批注目标文本，可能已被修改: "${ann.target.substring(0, 30)}..."`);
                return;
            }
            const withReplacement = content.replace(ann.target, ann.suggestion);
            const withoutAnnotation = removeAnnotationFromText(withReplacement, ann.id);
            await plugin.app.vault.modify(file, withoutAnnotation);
            new Notice('批注已应用');
        } else {
            // Global: delegate to AI via chat — show instructions
            new Notice('全文批注需要通过聊天窗口应用，请在聊天中发送"根据批注修改当前章节"');
        }
    };

    const dismissAnnotation = async (ann: Annotation) => {
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return;
        const content = await plugin.app.vault.read(file);
        const updated = removeAnnotationFromText(content, ann.id);
        await plugin.app.vault.modify(file, updated);
        new Notice('批注已删除');
    };

    const startEdit = (ann: Annotation) => {
        setEditingAnn(ann);
        setEditValue(ann.suggestion);
    };

    const saveEdit = async () => {
        if (!editingAnn || !editValue.trim()) return;
        const file = plugin.app.workspace.getActiveFile();
        if (!file) return;

        const content = await plugin.app.vault.read(file);
        const { annotations: parsed } = parseAnnotations(content);
        const updated = parsed.map(a =>
            a.id === editingAnn.id ? { ...a, suggestion: editValue.trim() } : a
        );
        const newContent = writeAnnotationBlock(content, updated);
        await plugin.app.vault.modify(file, newContent);
        setEditingAnn(null);
        setEditValue('');
    };

    const sendAnnotationRevisionToChat = (filePath: string, anns: Annotation[]) => {
        const chatLeaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
        if (chatLeaves.length === 0) {
            new Notice('请先打开 Voyaru 聊天窗口');
            return;
        }
        const chatLeaf = chatLeaves[0]!;
        const localAnns = anns.filter(a => a.type === 'local');
        const globalAnns = anns.filter(a => a.type === 'global');

        let message = `请根据以下批注，对文件 @${filePath} 进行整体修改：\n\n`;
        if (localAnns.length > 0) {
            message += `**局部修改批注（${localAnns.length} 条）：**\n`;
            localAnns.forEach((a, i) => {
                message += `${i + 1}. 将"${a.target}"改为：${a.suggestion}\n`;
            });
            message += '\n';
        }
        if (globalAnns.length > 0) {
            message += `**全文要求批注（${globalAnns.length} 条）：**\n`;
            globalAnns.forEach((a, i) => {
                message += `${i + 1}. ${a.suggestion}\n`;
            });
        }
        message += '\n请综合所有批注，对文章进行修改并写回文件。';

        const event = new CustomEvent('voyaru-annotation-revision', {
            detail: { message, filePath }
        });
        (chatLeaf.view as any).contentEl.dispatchEvent(event);
        plugin.app.workspace.revealLeaf(chatLeaf);
    };

    const scrollEditorToTarget = (ann: Annotation) => {
        if (!ann.target || !currentFilePath) return;

        // Find the MarkdownView leaf showing the current file.
        // Cannot use activeLeaf — clicking the annotation panel makes it the active leaf.
        let editorView: MarkdownView | null = null;
        plugin.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView &&
                leaf.view.file?.path === currentFilePath) {
                editorView = leaf.view as MarkdownView;
            }
        });
        if (!editorView) return;

        const editor = (editorView as MarkdownView).editor;
        const content = editor.getValue();
        // Search only in main content, not inside the annotation block
        const blockIdx = content.indexOf('%%voyaru-annotations');
        const searchContent = blockIdx > -1 ? content.substring(0, blockIdx) : content;
        const idx = searchContent.indexOf(ann.target);
        if (idx === -1) return;

        const from = editor.offsetToPos(idx);
        const to = editor.offsetToPos(idx + ann.target.length);
        editor.setSelection(from, to);
        editor.scrollIntoView({ from, to }, true);
        editor.focus();

        // Flash highlight via CM6
        const cmView = (editorView as any).editor?.cm as EditorView | undefined;
        if (cmView) {
            flashHighlight(cmView, idx, idx + ann.target.length);
        }
    };

    const handleCardClick = (ann: Annotation) => {
        setActiveAnnId(ann.id);
        scrollEditorToTarget(ann);
    };

    if (!currentFilePath) {
        return (
            <div className="voyaru-annotation-panel-empty">
                <span>打开一个文件以查看批注</span>
            </div>
        );
    }

    if (annotations.length === 0) {
        return (
            <div className="voyaru-annotation-panel">
                <div className="voyaru-annotation-panel-header">
                    <span className="voyaru-annotation-panel-title">批注面板</span>
                    <span className="voyaru-annotation-panel-file">{currentFilePath.split('/').pop()}</span>
                </div>
                <div className="voyaru-annotation-panel-empty">
                    <span>暂无批注</span>
                    <span className="voyaru-annotation-panel-hint">选中文本后通过菜单或命令添加批注</span>
                </div>
            </div>
        );
    }

    return (
        <div className="voyaru-annotation-panel">
            <div className="voyaru-annotation-panel-header">
                <span className="voyaru-annotation-panel-title">批注面板</span>
                <span className="voyaru-annotation-panel-count">{annotations.length} 条</span>
                <span className="voyaru-annotation-panel-file">{currentFilePath.split('/').pop()}</span>
            </div>
            <div className="voyaru-annotation-panel-actions">
                <button
                    className="voyaru-annotation-apply-all-btn"
                    onClick={() => currentFilePath && sendAnnotationRevisionToChat(currentFilePath, annotations)}
                    title="将所有批注发送给 AI，对全文进行整体修改"
                >
                    ✦ 根据批注整体修改
                </button>
            </div>
            <div className="voyaru-annotation-panel-list">
                {annotations.map(ann => (
                    editingAnn?.id === ann.id ? (
                        <div key={ann.id} className="voyaru-annotation-edit-form">
                            <textarea
                                className="voyaru-annotation-suggestion-input"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                rows={3}
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
                                    if (e.key === 'Escape') { setEditingAnn(null); setEditValue(''); }
                                }}
                            />
                            <div className="voyaru-annotation-edit-actions">
                                <button className="voyaru-ann-btn voyaru-ann-btn-apply" onClick={saveEdit}>保存</button>
                                <button className="voyaru-ann-btn" onClick={() => { setEditingAnn(null); setEditValue(''); }}>取消</button>
                            </div>
                        </div>
                    ) : (
                        <AnnotationCard
                            key={ann.id}
                            annotation={ann}
                            isActive={activeAnnId === ann.id}
                            onApply={applyAnnotation}
                            onDismiss={dismissAnnotation}
                            onEdit={startEdit}
                            onClick={handleCardClick}
                        />
                    )
                ))}
            </div>
        </div>
    );
};
