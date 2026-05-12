import React, { useState } from 'react';
import { CheckIcon, SparklesIcon } from './Icons';

interface AskUserOption {
    label: string;
    pros: string;
    cons: string;
}

interface AskUserCardProps {
    question: string;
    context: string;
    options: AskUserOption[];
    multiSelect: boolean;
    recommendation?: number;
    isConfirmed: boolean;
    isCancelled?: boolean;
    confirmedSelections?: number[];
    onConfirm: (selectedIndices: number[]) => void;
    onCancel: () => void;
}

export const AskUserCard: React.FC<AskUserCardProps> = ({
    question,
    context,
    options,
    multiSelect,
    recommendation,
    isConfirmed,
    isCancelled = false,
    confirmedSelections = [],
    onConfirm,
    onCancel
}) => {
    const [selectedIndices, setSelectedIndices] = useState<number[]>(
        isConfirmed ? confirmedSelections : []
    );

    const handleToggle = (index: number) => {
        if (isConfirmed) return;
        if (multiSelect) {
            setSelectedIndices(prev =>
                prev.includes(index)
                    ? prev.filter(i => i !== index)
                    : [...prev, index]
            );
        } else {
            setSelectedIndices([index]);
        }
    };

    const handleConfirm = () => {
        if (selectedIndices.length === 0 || isConfirmed || isCancelled) return;
        onConfirm(selectedIndices);
    };

    const handleCancel = () => {
        if (isConfirmed || isCancelled) return;
        onCancel();
    };

    const displaySelections = isConfirmed ? confirmedSelections : selectedIndices;
    const isDone = isConfirmed || isCancelled;

    return (
        <div className={`voyaru-ask-user-card${isDone ? ' voyaru-ask-user-card--confirmed' : ''}`}>
            <div className="voyaru-ask-user-card-header">
                <span className="voyaru-ask-user-card-icon"><SparklesIcon size={14} /></span>
                <span className="voyaru-ask-user-card-title">
                    {isCancelled ? '已取消' : isConfirmed ? '已做出选择' : (multiSelect ? '请选择（可多选）' : '请选择')}
                </span>
            </div>

            <div className="voyaru-ask-user-card-question">{question}</div>

            {context && (
                <div className="voyaru-ask-user-card-context">{context}</div>
            )}

            <div className="voyaru-ask-user-card-options">
                {options.map((option, index) => {
                    const isSelected = displaySelections.includes(index);
                    const isRecommended = recommendation === index;

                    return (
                        <div
                            key={index}
                            className={[
                                'voyaru-ask-user-option',
                                isSelected ? 'voyaru-ask-user-option--selected' : '',
                                isRecommended ? 'voyaru-ask-user-option--recommended' : '',
                                isDone ? 'voyaru-ask-user-option--readonly' : ''
                            ].filter(Boolean).join(' ')}
                            onClick={() => handleToggle(index)}
                        >
                            <div className="voyaru-ask-user-option-header">
                                <span className={`voyaru-ask-user-option-indicator${multiSelect ? ' voyaru-ask-user-option-indicator--checkbox' : ''}`}>
                                    {isSelected && <CheckIcon size={10} />}
                                </span>
                                <span className="voyaru-ask-user-option-label">{option.label}</span>
                                {isRecommended && !isDone && (
                                    <span className="voyaru-ask-user-option-recommended-badge">推荐</span>
                                )}
                            </div>
                            <div className="voyaru-ask-user-option-analysis">
                                <div className="voyaru-ask-user-option-pros">
                                    <span className="voyaru-ask-user-option-analysis-label">优</span>
                                    <span>{option.pros}</span>
                                </div>
                                <div className="voyaru-ask-user-option-cons">
                                    <span className="voyaru-ask-user-option-analysis-label">劣</span>
                                    <span>{option.cons}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="voyaru-ask-user-card-actions">
                {isCancelled ? (
                    <span className="voyaru-ask-user-confirmed-label">已取消</span>
                ) : isConfirmed ? (
                    <span className="voyaru-ask-user-confirmed-label">
                        <CheckIcon size={12} />
                        已选择：{confirmedSelections.map(i => options[i]?.label).join('、')}
                    </span>
                ) : (
                    <>
                        <button
                            className="voyaru-ask-user-confirm-btn"
                            onClick={handleConfirm}
                            disabled={selectedIndices.length === 0}
                        >
                            <CheckIcon size={12} /> 确认选择
                        </button>
                        <button
                            className="voyaru-ask-user-cancel-btn"
                            onClick={handleCancel}
                        >
                            取消
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
