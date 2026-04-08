import React, { useState } from 'react';
import { CheckIcon, StopIcon, EditIcon, TrashIcon, FileIcon } from './Icons';

interface PlanCardProps {
    planPath: string;
    chapterPath: string;
    content: string;
    confirmed?: boolean;
    aborted?: boolean;
    onConfirm: (planPath: string, chapterPath: string, editedContent: string, confirmMessage: string) => void;
    onRevise: (revisionNote: string) => void;
    onContentChange?: (newContent: string) => void;
    onAbortKeep: (planPath: string) => void;
    onAbortDelete: (planPath: string) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
    planPath,
    chapterPath,
    content,
    confirmed = false,
    aborted = false,
    onConfirm,
    onRevise,
    onContentChange,
    onAbortKeep,
    onAbortDelete
}) => {
    const [showReviseInput, setShowReviseInput] = useState(false);
    const [reviseNote, setReviseNote] = useState('');
    const [editedContent, setEditedContent] = useState(content);
    const [confirmMessage, setConfirmMessage] = useState('已确认章节规划，请按照规划开始编写章节正文。');

    const handleConfirm = () => {
        onConfirm(planPath, chapterPath, editedContent, confirmMessage);
    };

    const handleReviseSubmit = () => {
        if (reviseNote.trim()) {
            onRevise(reviseNote.trim());
            setReviseNote('');
            setShowReviseInput(false);
        }
    };

    return (
        <div className="voyaru-plan-card">
            <div className="voyaru-plan-card-header">
                <span className="voyaru-plan-card-icon"><FileIcon size={14} /></span>
                <span className="voyaru-plan-card-title">章节规划</span>
                <span className="voyaru-plan-card-path">{chapterPath}</span>
            </div>
            <div className="voyaru-plan-card-content">
                {confirmed ? (
                    <pre className="voyaru-plan-card-body">{editedContent}</pre>
                ) : (
                    <textarea
                        className="voyaru-plan-card-body voyaru-plan-card-body-editable"
                        value={editedContent}
                        onChange={e => {
                            setEditedContent(e.target.value);
                            onContentChange?.(e.target.value);
                        }}
                        rows={Math.max(6, editedContent.split('\n').length + 1)}
                    />
                )}
            </div>
            <div className="voyaru-plan-card-actions">
                {confirmed ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {aborted ? <><StopIcon size={12} /> 已中止</> : <><CheckIcon size={12} /> 规划已确认</>}
                    </span>
                ) : !showReviseInput ? (
                    <>
                        <textarea
                            className="voyaru-plan-card-confirm-msg"
                            value={confirmMessage}
                            onChange={e => setConfirmMessage(e.target.value)}
                            rows={2}
                        />
                        <button
                            className="voyaru-plan-card-btn voyaru-plan-card-btn-confirm"
                            onClick={handleConfirm}
                        >
                            <CheckIcon size={12} /> 确认规划，开始写作
                        </button>
                        <button
                            className="voyaru-plan-card-btn voyaru-plan-card-btn-revise"
                            onClick={() => setShowReviseInput(true)}
                        >
                            <EditIcon size={12} /> 提出修改意见
                        </button>
                        <button
                            className="voyaru-plan-card-btn voyaru-plan-card-btn-abort"
                            onClick={() => onAbortKeep(planPath)}
                        >
                            <StopIcon size={12} /> 保留规划并中止
                        </button>
                        <button
                            className="voyaru-plan-card-btn voyaru-plan-card-btn-abort"
                            onClick={() => onAbortDelete(planPath)}
                        >
                            <TrashIcon size={12} /> 删除规划并中止
                        </button>
                    </>
                ) : (
                    <div className="voyaru-plan-card-revise">
                        <textarea
                            className="voyaru-plan-card-revise-input"
                            value={reviseNote}
                            onChange={e => setReviseNote(e.target.value)}
                            placeholder="请输入修改意见，例如：增加更多环境描写，主角动机需要更清晰..."
                            rows={3}
                            autoFocus
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    handleReviseSubmit();
                                }
                                if (e.key === 'Escape') {
                                    setShowReviseInput(false);
                                    setReviseNote('');
                                }
                            }}
                        />
                        <div className="voyaru-plan-card-revise-actions">
                            <button
                                className="voyaru-plan-card-btn voyaru-plan-card-btn-confirm"
                                onClick={handleReviseSubmit}
                                disabled={!reviseNote.trim()}
                            >
                                提交修改意见
                            </button>
                            <button
                                className="voyaru-plan-card-btn voyaru-plan-card-btn-cancel"
                                onClick={() => { setShowReviseInput(false); setReviseNote(''); }}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <div className="voyaru-plan-card-footer">
                <span className="voyaru-plan-card-filepath">保存至: {planPath}</span>
            </div>
        </div>
    );
};
