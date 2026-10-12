import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const LiquidAlertModal = ({
  isOpen,
  title,
  message,
  type = 'info', // 'success' | 'error' | 'warning' | 'info'
  buttonText = 'Đã hiểu',
  onClose
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let Icon = Info;
  let accentColor = '#38bdf8';
  let glowColor = 'rgba(56, 189, 248, 0.22)';
  let btnClass = 'btn-primary';
  let defaultTitle = 'Thông báo';

  if (type === 'success') {
    Icon = CheckCircle2;
    accentColor = '#34d399';
    glowColor = 'rgba(16, 185, 129, 0.22)';
    btnClass = 'btn-outline btn-outline-success';
    defaultTitle = 'Thành công';
  } else if (type === 'error') {
    Icon = AlertCircle;
    accentColor = '#f87171';
    glowColor = 'rgba(239, 68, 68, 0.22)';
    btnClass = 'btn-outline btn-outline-danger';
    defaultTitle = 'Đã xảy ra lỗi';
  } else if (type === 'warning') {
    Icon = AlertTriangle;
    accentColor = '#fbbf24';
    glowColor = 'rgba(245, 158, 11, 0.22)';
    btnClass = 'btn-outline btn-outline-warning';
    defaultTitle = 'Cảnh báo';
  }

  const displayTitle = title || defaultTitle;

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
          zIndex: 450,
          padding: '1.25rem'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="liquid-card"
          style={{
            maxWidth: '460px',
            width: '100%',
            padding: '1.75rem',
            background: 'rgba(18, 24, 38, 0.94)',
            border: '1px solid var(--glass-border-strong)',
            boxShadow: `0 16px 40px rgba(0, 0, 0, 0.5), 0 0 24px ${glowColor}`,
            position: 'relative'
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
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
              justifyContent: 'center',
              transition: 'color 0.2s ease'
            }}
            title="Đóng"
          >
            <X size={18} />
          </button>

          {/* Icon & Title Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.125rem' }}>
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
              <Icon size={20} style={{ color: accentColor }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {displayTitle}
              </h3>
            </div>
          </div>

          {/* Message Body */}
          <div style={{ 
            color: 'var(--text-secondary)', 
            fontSize: '0.9375rem', 
            lineHeight: 1.6, 
            marginBottom: '1.75rem', 
            whiteSpace: 'pre-line',
            wordBreak: 'break-word'
          }}>
            {message}
          </div>

          {/* Action Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              autoFocus
              className={btnClass}
              style={{ 
                padding: '0.55rem 1.5rem', 
                fontSize: '0.875rem', 
                minWidth: '100px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {buttonText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LiquidAlertModal;
