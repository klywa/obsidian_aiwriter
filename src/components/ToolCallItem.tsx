import * as React from 'react';
import { Message } from '../settings';
import { TFile, MarkdownView } from 'obsidian';
import {
    ChevronDownIcon,
} from './Icons';
import { StatusIcon } from './StatusIcon';

interface ToolCallItemProps {
    message: Message;
    onToggleExpand: (id: string) => void;
    plugin?: any; // Obsidian plugin instance for file operations
}

export const ToolCallItem: React.FC<ToolCallItemProps> = ({ message, onToggleExpand, plugin }) => {
    const status = message.status || 'completed';
    const isRunning = status === 'running';
    const isCompleted = status === 'completed';
    const isFailed = status === 'failed';
    const isPending = status === 'pending';
    const expanded = message.expanded || false;

    // Track if component is newly added for entry animation
    const [isNewlyAdded, setIsNewlyAdded] = React.useState(true);

    // Track if tool has been running for a long time (>1s) to show thinking animation
    const [isLongRunning, setIsLongRunning] = React.useState(false);

    React.useEffect(() => {
        const timer = setTimeout(() => setIsNewlyAdded(false), 300);
        return () => clearTimeout(timer);
    }, []);

    // Set long-running state after 1 second of running
    React.useEffect(() => {
        if (isRunning) {
            const timer = setTimeout(() => setIsLongRunning(true), 1000);
            return () => clearTimeout(timer);
        } else {
            setIsLongRunning(false);
            return undefined;
        }
    }, [isRunning]);

    // Get the tool description based on tool type and status
    const getToolDescription = () => {
        const args = message.toolData?.args || {};
        const result = message.toolData?.result;

        switch (message.tool) {
            case 'readFile': {
                const path = args.path || 'unknown file';
                if (isRunning || isPending) return `Reading ${path}...`;
                if (isFailed) return `Failed to read ${path}`;
                return `Read ${path}`;
            }
            case 'writeFile': {
                const path = args.path || 'unknown file';
                const content = args.content || '';
                const charCount = content.length;
                if (isRunning || isPending) return `Writing ${path}...`;
                if (isFailed) return `Failed to write ${path}`;
                return `Wrote ${path} (${charCount.toLocaleString()} chars)`;
            }
            case 'editFile': {
                const path = args.path || 'unknown file';
                if (isRunning || isPending) return `Editing ${path}...`;
                if (isFailed) return `Failed to edit ${path}`;
                return `Edited ${path}`;
            }
            case 'deleteFile': {
                const path = args.path || 'unknown file';
                if (isRunning || isPending) return `Deleting ${path}...`;
                if (isFailed) return `Failed to delete ${path}`;
                return `Deleted ${path}`;
            }
            case 'listFiles': {
                const folder = args.folder || 'unknown folder';
                if (isRunning || isPending) return `Listing ${folder}...`;
                if (isFailed) return `Failed to list ${folder}`;
                // Try to parse result to get file count
                let fileCount = 0;
                if (typeof result === 'string') {
                    try {
                        const parsed = JSON.parse(result);
                        fileCount = Array.isArray(parsed) ? parsed.length : 0;
                    } catch {
                        // If parse fails, count lines
                        fileCount = result.split('\n').filter(line => line.trim()).length;
                    }
                } else if (Array.isArray(result)) {
                    fileCount = result.length;
                }
                return `Found ${fileCount} file${fileCount !== 1 ? 's' : ''} in ${folder}`;
            }
            case 'postCheck': {
                const filePath = args.filePath || 'file';
                if (isRunning || isPending) return `Running post-check on ${filePath}...`;
                if (isFailed) return `Post-check failed for ${filePath}`;
                // Parse result to show summary
                if (typeof result === 'string') {
                    if (result.includes('meets all requirements')) {
                        return `Post-check passed: ${filePath}`;
                    } else if (result.includes('refined')) {
                        return `Post-check completed: Content refined`;
                    }
                }
                return `Post-check completed for ${filePath}`;
            }
            case 'memoryExtract': {
                const filePath = args.filePath || 'file';
                if (isRunning || isPending) return `正在提取记忆: ${filePath}...`;
                if (isFailed) return `记忆提取失败: ${filePath}`;
                if (typeof result === 'string') {
                    if (result.includes('记忆已更新')) {
                        const lines = result.split('\n');
                        const count = lines.filter(l => l.trim().startsWith('-')).length;
                        return `记忆更新完成（${count} 个实体）`;
                    }
                    if (result.includes('未检测到')) {
                        return `记忆无需更新: ${filePath}`;
                    }
                }
                return `记忆提取完成: ${filePath}`;
            }
            default:
                return message.tool || 'Unknown operation';
        }
    };

    // Format duration
    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    // Get file path for file operations
    const getFilePath = (): string | null => {
        const args = message.toolData?.args || {};
        if (message.tool === 'readFile' ||
            message.tool === 'writeFile' ||
            message.tool === 'editFile' ||
            message.tool === 'deleteFile') {
            return args.path || null;
        }
        return null;
    };

    // Open file in Obsidian
    const openFile = async (path: string) => {
        if (!plugin) return;
        try {
            let file = plugin.app.vault.getAbstractFileByPath(path);
            if (!file) {
                file = plugin.app.metadataCache.getFirstLinkpathDest(path, '');
            }

            if (file instanceof TFile) {
                // Check if already open in any leaf
                let foundLeaf: any = null;
                if (plugin.app && plugin.app.workspace) {
                    plugin.app.workspace.iterateAllLeaves((leaf: any) => {
                        if (leaf.view && leaf.view instanceof MarkdownView &&
                            leaf.view.file && leaf.view.file.path === file.path) {
                            foundLeaf = leaf;
                        }
                    });
                }

                if (foundLeaf) {
                    plugin.app.workspace.setActiveLeaf(foundLeaf, { focus: true });
                } else {
                    await plugin.app.workspace.getLeaf(true).openFile(file);
                }
            } else {
                await plugin.app.workspace.openLinkText(path, '', true);
            }
        } catch (e) {
            console.error("Failed to open file:", e);
            await plugin.app.workspace.openLinkText(path, '', true);
        }
    };

    // Render description with file link
    const renderDescription = () => {
        const filePath = getFilePath();
        const description = getToolDescription();

        if (filePath && isCompleted && plugin) {
            // File operation completed, make file path clickable
            return (
                <span
                    onClick={() => openFile(filePath)}
                    style={{
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textDecorationStyle: 'dashed',
                        textDecorationColor: 'var(--interactive-accent)',
                        color: 'var(--text-normal)'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--interactive-accent)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-normal)';
                    }}
                >
                    {description}
                </span>
            );
        }

        return <span>{description}</span>;
    };

    return (
        <div
            className={`voyaru-tool-call-item ${status}`}
            style={{
                marginBottom: '8px',
                borderRadius: '8px',
                border: '1px solid var(--background-modifier-border)',
                backgroundColor: 'var(--background-secondary)',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                position: 'relative',
                animation: isNewlyAdded ? 'voyaru-slideDown 0.2s ease-out' : undefined,
            }}
        >
            {/* Header (always visible) */}
            <div
                className="voyaru-tool-call-header"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                }}
            >
                {/* Status Icon - using unified StatusIcon component */}
                <StatusIcon status={status} size={8} />

                {/* Description */}
                <div
                    className="voyaru-tool-description"
                    style={{
                        flex: 1,
                        fontSize: '13px',
                        color: 'var(--text-normal)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {renderDescription()}
                </div>

                {/* Expand Chevron Button */}
                <button
                    className={`voyaru-tool-chevron ${expanded ? 'expanded' : ''}`}
                    onClick={() => message.id && onToggleExpand(message.id)}
                    style={{
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                        color: 'var(--text-muted)',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        padding: '0',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)';
                        e.currentTarget.style.color = 'var(--text-normal)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                >
                    <ChevronDownIcon size={14} />
                </button>
            </div>

            {/* Progress Bar (running state) */}
            {isRunning && (
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    backgroundColor: 'var(--background-modifier-border)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%',
                        width: '100%',
                        background: `linear-gradient(90deg,
                            transparent 0%,
                            var(--interactive-accent) 50%,
                            transparent 100%)`,
                        backgroundSize: '200% 100%',
                        animation: 'voyaru-progressSlide 1.5s ease-in-out infinite',
                    }} />
                </div>
            )}

            {/* Thinking dots (for long-running operations >1s) - positioned on left side */}
            {isLongRunning && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '32px', // Adjusted for removed tool icon
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    gap: '4px',
                    alignItems: 'center',
                }}>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            style={{
                                width: '4px',
                                height: '4px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--interactive-accent)',
                                animation: `voyaru-dots-bounce 1.4s ${i * 0.16}s infinite ease-in-out`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Details Panel (expandable) */}
            {expanded && (
                <div
                    className="voyaru-tool-details"
                    style={{
                        padding: '12px',
                        borderTop: '1px solid var(--background-modifier-border)',
                        backgroundColor: 'var(--background-primary)',
                        animation: 'voyaru-slideDown 0.2s ease-out',
                    }}
                >
                    {/* Arguments */}
                    {message.toolData?.args && (
                        <div style={{ marginBottom: '12px' }}>
                            <div
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    marginBottom: '6px',
                                }}
                            >
                                参数
                            </div>
                            <pre
                                style={{
                                    fontFamily: 'var(--font-monospace)',
                                    fontSize: '12px',
                                    lineHeight: '1.5',
                                    padding: '8px 10px',
                                    backgroundColor: 'var(--background-secondary)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--background-modifier-border)',
                                    overflowX: 'auto',
                                    color: 'var(--text-normal)',
                                    margin: 0,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}
                            >
                                {JSON.stringify(message.toolData.args, null, 2)}
                            </pre>
                        </div>
                    )}

                    {/* Result */}
                    {message.toolData?.result !== undefined && (
                        <div style={{ marginBottom: '12px' }}>
                            <div
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    marginBottom: '6px',
                                }}
                            >
                                结果
                            </div>
                            <div
                                style={{
                                    fontSize: '12px',
                                    lineHeight: '1.5',
                                    padding: '8px 10px',
                                    backgroundColor: 'var(--background-secondary)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--background-modifier-border)',
                                    color: 'var(--text-normal)',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    maxHeight: '200px',
                                    overflow: 'auto',
                                }}
                            >
                                {typeof message.toolData.result === 'string'
                                    ? message.toolData.result
                                    : JSON.stringify(message.toolData.result, null, 2)}
                            </div>
                        </div>
                    )}

                    {/* Duration */}
                    {message.endTime && message.startTime && (
                        <div
                            style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                textAlign: 'right',
                                marginTop: '8px',
                            }}
                        >
                            耗时: {formatDuration(message.endTime - message.startTime)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
