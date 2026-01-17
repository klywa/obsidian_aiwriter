import * as React from 'react';
import { MessageStatus } from '../settings';

interface StatusIconProps {
    status: MessageStatus;
    size?: number;
    className?: string;
}

/**
 * 统一的状态图标组件 - 极简圆点风格
 *
 * 状态颜色：
 * - running: 主题色 (呼吸动效)
 * - completed: 绿色
 * - failed: 红色
 * - cancelled/pending: 灰色
 */
export const StatusIcon: React.FC<StatusIconProps> = ({
    status,
    size = 10,
    className = ''
}) => {
    const getStatusColor = () => {
        switch (status) {
            case 'completed': return 'var(--text-success)';
            case 'failed': return 'var(--text-error)';
            case 'running': return 'var(--interactive-accent)';
            case 'cancelled':
            case 'pending':
            default: return 'var(--text-muted)';
        }
    };

    const isRunning = status === 'running';

    return (
        <div
            className={`voyaru-status-dot ${className}`}
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: getStatusColor(),
                animation: isRunning ? 'voyaru-breathe 2s ease-in-out infinite' : 'none',
                flexShrink: 0
            }}
        />
    );
};

export default StatusIcon;
