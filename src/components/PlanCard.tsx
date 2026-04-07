import React, { useState } from 'react';

interface PlanCardProps {
    planPath: string;
    chapterPath: string;
    content: string;
    onConfirm: (planPath: string, chapterPath: string) => void;
    onRevise: (revisionNote: string) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
    planPath,
    chapterPath,
    content,
    onConfirm,
    onRevise
}) => {
    const [showReviseInput, setShowReviseInput] = useState(false);
    const [reviseNote, setReviseNote] = useState('');

    const handleConfirm = () => {
        onConfirm(planPath, chapterPath);
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
                <span className="voyaru-plan-card-icon">📋</span>
                <span className="voyaru-plan-card-title">章节规划</span>
                <span className="voyaru-plan-card-path">{chapterPath}</span>
            </div>
            <div className="voyaru-plan-card-content">
                <pre className="voyaru-plan-card-body">{content}</pre>
            </div>
            <div className="voyaru-plan-card-actions">
                {!showReviseInput ? (
                    <>
                        <button
                            className="voyaru-plan-card-btn voyaru-plan-card-btn-confirm"
                            onClick={handleConfirm}
                        >
                            ✓ 确认规划，开始写作
                        </button>
                        <button
                            className="voyaru-plan-card-btn voyaru-plan-card-btn-revise"
                            onClick={() => setShowReviseInput(true)}
                        >
                            ✏️ 提出修改意见
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
