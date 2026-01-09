import * as React from 'react';
import { Message } from '../settings';
import {
    CheckIcon,
    ChevronDownIcon,
    LoadingSpinner,
    PendingIcon,
    ErrorIcon,
    ToolIcon,
    FileReadIcon,
    FileWriteIcon,
    FileEditIcon,
    TrashIcon,
    FileIcon,
} from './Icons';

interface ToolCallItemProps {
    message: Message;
    onToggleExpand: (id: string) => void;
}

export const ToolCallItem: React.FC<ToolCallItemProps> = ({ message, onToggleExpand }) => {
    const status = message.status || 'completed';
    const isRunning = status === 'running';
    const isCompleted = status === 'completed';
    const isFailed = status === 'failed';
    const isPending = status === 'pending';
    const expanded = message.expanded || false;

    // Get the appropriate tool icon
    const getToolIcon = () => {
        switch (message.tool) {
            case 'readFile':
                return <FileReadIcon size={16} />;
            case 'writeFile':
                return <FileWriteIcon size={16} />;
            case 'editFile':
                return <FileEditIcon size={16} />;
            case 'deleteFile':
                return <TrashIcon size={16} />;
            case 'listFiles':
                return <FileIcon size={16} />;
            default:
                return <ToolIcon size={16} />;
        }
    };

    // Get the appropriate status icon
    const getStatusIcon = () => {
        if (isRunning) {
            return <LoadingSpinner size={14} />;
        }
        if (isCompleted) {
            return <CheckIcon size={14} />;
        }
        if (isFailed) {
            return <ErrorIcon size={14} />;
        }
        return <PendingIcon size={14} />;
    };

    // Get the status color
    const getStatusColor = () => {
        if (isFailed) return 'var(--text-error)';
        if (isCompleted) return 'var(--text-success)';
        if (isRunning) return 'var(--interactive-accent)';
        return 'var(--text-muted)';
    };

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
            default:
                return message.tool || 'Unknown operation';
        }
    };

    // Format duration
    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
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
            }}
        >
            {/* Header (always visible) */}
            <div
                className="voyaru-tool-call-header"
                onClick={() => message.id && onToggleExpand(message.id)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--background-modifier-hover)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                }}
            >
                {/* Status Icon */}
                <div
                    className={`voyaru-tool-status ${status}`}
                    style={{
                        width: '18px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: getStatusColor(),
                    }}
                >
                    {getStatusIcon()}
                </div>

                {/* Tool Icon */}
                <div
                    className="voyaru-tool-icon"
                    style={{
                        width: '18px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: getStatusColor(),
                        transition: 'color 0.2s ease',
                    }}
                >
                    {getToolIcon()}
                </div>

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
                    {getToolDescription()}
                </div>

                {/* Expand Chevron */}
                <div
                    className={`voyaru-tool-chevron ${expanded ? 'expanded' : ''}`}
                    style={{
                        width: '16px',
                        height: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'transform 0.2s ease',
                        color: 'var(--text-muted)',
                        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                >
                    <ChevronDownIcon size={14} />
                </div>
            </div>

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
