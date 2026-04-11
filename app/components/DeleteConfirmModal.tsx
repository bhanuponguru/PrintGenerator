'use client';

interface DeleteConfirmModalProps {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export default function DeleteConfirmModal({
  title,
  message,
  onClose,
  onConfirm,
  loading,
}: DeleteConfirmModalProps) {
  return (
    <div
      className="pg-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="pg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
      >
        <div className="pg-modal-header">
          <div>
            <h2 className="pg-modal-title" id="delete-confirm-title" style={{ color: 'var(--pg-error)' }}>
              {title}
            </h2>
          </div>
          <button className="pg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pg-modal-body">
          <p style={{ color: 'var(--pg-text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
            {message}
          </p>
        </div>

        <div className="pg-modal-footer">
          <button className="pg-btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button 
            className="pg-btn-primary" 
            onClick={onConfirm} 
            disabled={loading}
            style={{ backgroundColor: 'var(--pg-error)', borderColor: 'var(--pg-error)' }}
          >
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
