import * as React from 'react';
import { ErrorIcon } from './Icons';

/**
 * ErrorMessage Component
 *
 * Displays error messages with optional retry action.
 * Features:
 * - Shake animation on appearance
 * - Retry button for recoverable errors
 * - Dismiss button to close the error
 * - Accessible with ARIA labels
 *
 * @example
 * ```tsx
 * <ErrorMessage
 *   title="API Error"
 *   error="Failed to connect to the server"
 *   onRetry={() => retryRequest()}
 *   onDismiss={() => setError(null)}
 * />
 * ```
 */

export interface ErrorMessageProps {
	/** Error title (default: "出错了") */
	title?: string;
	/** Error message to display */
	error: string;
	/** Optional retry callback */
	onRetry?: () => void;
	/** Optional dismiss callback */
	onDismiss?: () => void;
	/** Optional CSS class name */
	className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
	title = '出错了',
	error,
	onRetry,
	onDismiss,
	className = '',
}) => {
	const [isVisible, setIsVisible] = React.useState(true);

	const handleDismiss = () => {
		setIsVisible(false);
		// Wait for animation to complete
		setTimeout(() => {
			onDismiss?.();
		}, 250);
	};

	if (!isVisible) return null;

	return (
		<div className={`voyaru-error-card ${className}`}>
			<div className="voyaru-error-icon">
				<ErrorIcon size={20} />
			</div>
			<div className="voyaru-error-content">
				<div className="voyaru-error-title">{title}</div>
				<div className="voyaru-error-message">{error}</div>
			</div>
			{onRetry && (
				<button
					className="voyaru-error-retry"
					onClick={onRetry}
					aria-label="重试"
				>
					重试
				</button>
			)}
			{onDismiss && (
				<button
					className="voyaru-error-dismiss"
					onClick={handleDismiss}
					aria-label="关闭"
				>
					✕
				</button>
			)}
		</div>
	);
};

export default ErrorMessage;
