import React, { useEffect } from 'react';
import { FiTrash2, FiAlertCircle, FiX } from 'react-icons/fi';

const ConfirmModal = ({ show, onClose, onConfirm, title, message, confirmText = 'ยืนยัน', cancelText = 'ยกเลิก', danger = true, loading }) => {
  useEffect(() => {
    if (!show) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ animation: 'fadeIn 0.15s ease' }}>
      <div className="cfm-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cfm-close" onClick={onClose} disabled={loading}><FiX size={18} /></button>
        
        <div className="cfm-top">
          <div className={`cfm-badge ${danger ? 'danger' : 'info'}`}>
            {danger ? <FiTrash2 size={20} /> : <FiAlertCircle size={20} />}
          </div>
          <h4 className="cfm-title">{title}</h4>
        </div>

        <div className="cfm-divider" />

        <p className="cfm-message">{message}</p>

        <div className="cfm-actions">
          <button className="cfm-btn cfm-btn-cancel" onClick={onClose} disabled={loading}>
            {cancelText}
          </button>
          <button 
            className={`cfm-btn ${danger ? 'cfm-btn-danger' : 'cfm-btn-primary'}`} 
            onClick={onConfirm} 
            disabled={loading}
          >
            {loading && <span className="cfm-spinner" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
