import * as React from 'react';

/**
 * LoadingIndicator Component
 *
 * Unified loading indicator with multiple styles and sizes.
 * Designed for consistent loading UX across the plugin.
 *
 * @example
 * ```tsx
 * <LoadingIndicator type="spinner" size="md" />
 * <LoadingIndicator type="dots" size="sm" color="#5B9BD5" />
 * ```
 */

export type LoadingType = 'spinner' | 'dots' | 'pulse';
export type LoadingSize = 'sm' | 'md' | 'lg';

export interface LoadingIndicatorProps {
	/** Type of loading animation */
	type?: LoadingType;
	/** Size of the indicator */
	size?: LoadingSize;
	/** Custom color (overrides default primary color) */
	color?: string;
	/** Optional CSS class name */
	className?: string;
}

const sizeMap: Record<LoadingSize, number> = {
	sm: 16,
	md: 24,
	lg: 32,
};

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
	type = 'spinner',
	size = 'md',
	color,
	className = '',
}) => {
	const pixelSize = sizeMap[size];

	const renderSpinner = () => (
		<div
			className="voyaru-loading-spinner"
			style={{
				width: pixelSize,
				height: pixelSize,
				borderColor: color || undefined,
				borderTopColor: color || undefined,
			}}
		/>
	);

	const renderDots = () => (
		<div className="voyaru-loading-dots" style={{ gap: pixelSize / 4 }}>
			{color && (
				<style>{`
					.voyaru-loading-dots span,
					.voyaru-loading-dots::before,
					.voyaru-loading-dots::after {
						background: ${color} !important;
					}
				`}</style>
			)}
		</div>
	);

	const renderPulse = () => (
		<div
			className="voyaru-loading-pulse"
			style={{
				width: pixelSize,
				height: pixelSize,
				backgroundColor: color || undefined,
			}}
		/>
	);

	return (
		<div className={`voyaru-loading voyaru-loading-${type} voyaru-loading-${size} ${className}`}>
			{type === 'spinner' && renderSpinner()}
			{type === 'dots' && renderDots()}
			{type === 'pulse' && renderPulse()}
		</div>
	);
};

export default LoadingIndicator;
