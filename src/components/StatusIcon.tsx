import * as React from 'react';
import { MessageStatus } from '../settings';

interface StatusIconProps {
    status: MessageStatus;
    size?: number;
    className?: string;
}

/**
 * 统一的状态图标组件
 *
 * 四种状态：
 * - running: 圆形旋转 Spinner
 * - completed: 静态对勾
 * - failed: 感叹号
 * - cancelled: X 图标
 * - pending: 小圆点
 */
export const StatusIcon: React.FC<StatusIconProps> = ({
    status,
    size = 16,
    className = ''
}) => {
    const statusClass = `voyaru-status-icon voyaru-status-icon--${status} ${className}`.trim();

    // Running 状态使用旋转 Spinner
    if (status === 'running') {
        return (
            <div className={statusClass} style={{ width: size, height: size }}>
                <svg
                    width={size}
                    height={size}
                    viewBox="0 0 24 24"
                    fill="none"
                    className="voyaru-status-spinner"
                >
                    <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        fill="none"
                        strokeDasharray="32 32"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
        );
    }

    // 其他状态使用静态图标
    const renderIcon = () => {
        switch (status) {
            case 'completed':
                // 对勾图标
                return (
                    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                        <polyline
                            points="20 6 9 17 4 12"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                );

            case 'failed':
                // 感叹号图标
                return (
                    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                        <circle
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                        />
                        <line
                            x1="12"
                            y1="8"
                            x2="12"
                            y2="12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                        <circle cx="12" cy="16" r="1" fill="currentColor" />
                    </svg>
                );

            case 'cancelled':
                // X 图标
                return (
                    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                        <circle
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                        />
                        <line
                            x1="15"
                            y1="9"
                            x2="9"
                            y2="15"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                        <line
                            x1="9"
                            y1="9"
                            x2="15"
                            y2="15"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                );

            case 'pending':
            default:
                // 小圆点
                return (
                    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.5" />
                    </svg>
                );
        }
    };

    return (
        <div className={statusClass} style={{ width: size, height: size }}>
            {renderIcon()}
        </div>
    );
};

export default StatusIcon;
