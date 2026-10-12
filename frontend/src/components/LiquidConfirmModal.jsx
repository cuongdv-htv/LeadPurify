import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, Square, Play, Pause, RefreshCw, Sparkles, X } from 'lucide-react';

export const LiquidConfirmModal = ({
  isOpen,
  title = "Xác nhận thao tác",
  message = "Bạn có chắc chắn muốn thực hiện hành động này không?",
  confirmText = "Xác nhận",
  cancelText = "Hủy bỏ",
  tone = "danger", // 'danger' | 'warning' | 'primary' | 'success'
  icon: CustomIcon = null,
  isLoading = false,
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  let ToneIcon = AlertTriangle;
  let accentColor = '#ef4444';
  let confirmBtnClass = 'btn-outline btn-outline-danger';
  let glowColor = 'rgba(239, 68, 68, 0.2)';

  if (CustomIcon) {
    ToneIcon = CustomIcon;
  } else if (tone === 'warning') {
    ToneIcon = AlertTriangle;
    accentColor = '#f59e0b';
    confirmBtnClass = 'btn-outline btn-outline-warning';
    glowColor = 'rgba(245, 158, 11, 0.2)';
  } else if (tone === 'primary') {
    ToneIcon = RefreshCw;
    accentColor = 'var(--color-accent)';
    confirmBtnClass = 'btn-primary';
    glowColor = 'rgba(0, 102, 255, 0.25)';
  } else if (tone === 'success') {
    ToneIcon = Play;
    accentColor = '#10b981';
    confirmBtnClass = 'btn-outline btn-outline-success';
    glowColor = 'rgba(16, 185, 129, 0.2)';
  }

  return (
    <AnimatePresence>
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          background: 'rgba(10, 14, 22, 0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 350,
          padding: '1.25rem'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoading) onCancel();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="liquid-card"
          style={{
            maxWidth: '480px',
            width: '100%',
            padding: '1.75rem',
            background: 'rgba(18, 24, 38, 0.92)',
            border: '1px solid var(--glass-border-strong)',
            boxShadow: `0 16px 40px rgba(0, 0, 0, 0.5), 0 0 24px ${glowColor}`,
            position: 'relative'
          }}
        >
          {/* Close button */}
          <button
            onClick={onCancel}
            disabled={isLoading}
            style={{
              position: 'absolute',
              top: '1.25rem',
              right: '1.25rem',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Đóng"
          >
            <X size={18} />
          </button>

          {/* Icon Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1rem' }}>
            <div 
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: `${glowColor}`,
                border: `1px solid ${accentColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <ToneIcon size={20} style={{ color: accentColor }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {title}
              </h3>
            </div>
          </div>

          {/* Message Body */}
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.75rem', whiteSpace: 'pre-line' }}>
            {message}
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="btn-outline"
              style={{ padding: '0.55rem 1.25rem', fontSize: '0.875rem' }}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={confirmBtnClass}
              style={{ padding: '0.55rem 1.25rem', fontSize: '0.875rem', minWidth: '100px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              {isLoading && <RefreshCw size={14} className="spin" />}
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LiquidConfirmModal;
