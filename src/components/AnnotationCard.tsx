import React from 'react';
import type { Annotation } from '../editor/annotation_parser';

interface AnnotationCardProps {
    annotation: Annotation;
    isActive: boolean;
    onApply: (ann: Annotation) => void;
    onDismiss: (ann: Annotation) => void;
    onEdit: (ann: Annotation) => void;
    onClick: (ann: Annotation) => void;
}

export const AnnotationCard: React.FC<AnnotationCardProps> = ({
    annotation,
    isActive,
    onApply,
    onDismiss,
    onEdit,
    onClick
}) => {
    return (
        <div
            className={`voyaru-annotation-card ${isActive ? 'active' : ''} ${annotation.type}`}
            onClick={() => onClick(annotation)}
        >
            <div className="voyaru-annotation-card-header">
                <span className={`voyaru-annotation-type-badge ${annotation.type}`}>
                    {annotation.type === 'local' ? '局部' : '全文'}
                </span>
                {annotation.target && (
                    <span className="voyaru-annotation-target" title={annotation.target}>
                        "{annotation.target.length > 20 ? annotation.target.substring(0, 20) + '…' : annotation.target}"
                    </span>
                )}
            </div>
            <div className="voyaru-annotation-suggestion">
                {annotation.suggestion}
            </div>
            <div className="voyaru-annotation-card-actions">
                <button
                    className="voyaru-ann-btn voyaru-ann-btn-apply"
                    onClick={e => { e.stopPropagation(); onApply(annotation); }}
                    title="应用此批注"
                >
                    ✓ 应用
                </button>
                <button
                    className="voyaru-ann-btn voyaru-ann-btn-edit"
                    onClick={e => { e.stopPropagation(); onEdit(annotation); }}
                    title="编辑建议内容"
                >
                    编辑
                </button>
                <button
                    className="voyaru-ann-btn voyaru-ann-btn-dismiss"
                    onClick={e => { e.stopPropagation(); onDismiss(annotation); }}
                    title="删除此批注"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};
