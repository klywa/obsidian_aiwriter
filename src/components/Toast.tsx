import * as React from 'react';

/**
 * Toast Component
 *
 * Floating notification for success/info/warning messages.
 * Auto-dismisses after a configurable duration.
 *
 * @example
 * ```tsx
 * <Toast
 *   type="success"
 *   message="File saved successfully"
 *   duration={3000}
 *   onClose={() => setVisible(false)}
 * />
 * ```
 */

export type ToastType = 'success' | 'info' | 'warning';

export interface ToastProps {
	/** Type of toast notification */
	type?: ToastType;
	/** Message to display */
	message: string;
	/** Auto-dismiss duration in ms (0 to disable) */
	duration?: number;
	/** Callback when toast is dismissed */
	onClose?: () => void;
	/** Optional CSS class name */
	className?: string;
}

export const Toast: React.FC<ToastProps> = ({
	type = 'success',
	message,
	duration = 3000,
	onClose,
	className = '',
}) => {
	const [isVisible, setIsVisible] = React.useState(true);

	React.useEffect(() => {
		if (duration > 0) {
			const timer = setTimeout(() => {
				setIsVisible(false);
				setTimeout(() => onClose?.(), 250); // Wait for exit animation
			}, duration);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [duration, onClose]);

	const handleClick = () => {
		setIsVisible(false);
		setTimeout(() => onClose?.(), 250);
	};

	const icons = {
		success: '✓',
		info: 'ℹ',
		warning: '⚠',
	};

	return (
		<div
			className={`voyaru-toast voyaru-toast-${type} ${isVisible ? 'visible' : ''} ${className}`}
			onClick={handleClick}
			role="alert"
			aria-live="polite"
		>
			<span className="voyaru-toast-icon">{icons[type]}</span>
			<span className="voyaru-toast-message">{message}</span>
		</div>
	);
};

export default Toast;
