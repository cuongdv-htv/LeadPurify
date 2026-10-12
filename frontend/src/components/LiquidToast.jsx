import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export const LiquidToastContainer = ({ toasts = [], onRemove }) => {
  return (
    <div 
      style={{
        position: 'fixed',
        top: '1.5rem',
        right: '1.5rem',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        pointerEvents: 'none',
        maxWidth: '420px',
        width: 'calc(100vw - 3rem)'
      }}
    >
      <AnimatePresence>
        {toasts.map(toast => {
          let icon = <Info size={18} style={{ color: '#38bdf8' }} />;
          let borderColor = 'rgba(56, 189, 248, 0.3)';
          let bgColor = 'rgba(18, 24, 38, 0.88)';
          let accentGlow = 'rgba(56, 189, 248, 0.15)';

          if (toast.type === 'success') {
            icon = <CheckCircle size={18} style={{ color: '#34d399' }} />;
            borderColor = 'rgba(16, 185, 129, 0.35)';
            accentGlow = 'rgba(16, 185, 129, 0.15)';
          } else if (toast.type === 'error') {
            icon = <XCircle size={18} style={{ color: '#f87171' }} />;
            borderColor = 'rgba(239, 68, 68, 0.35)';
            accentGlow = 'rgba(239, 68, 68, 0.15)';
          } else if (toast.type === 'warning') {
            icon = <AlertTriangle size={18} style={{ color: '#fbbf24' }} />;
            borderColor = 'rgba(245, 158, 11, 0.35)';
            accentGlow = 'rgba(245, 158, 11, 0.15)';
          }

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.95 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={{
                pointerEvents: 'auto',
                background: bgColor,
                backdropFilter: 'blur(20px) saturate(160%)',
                WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                border: `1px solid ${borderColor}`,
                borderRadius: 'var(--radius-base)',
                padding: '0.875rem 1.125rem',
                boxShadow: `0 8px 30px rgba(0, 0, 0, 0.4), 0 0 16px ${accentGlow}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                color: 'var(--text-primary)',
                overflow: 'hidden'
              }}
            >
              <div style={{ flexShrink: 0, marginTop: '2px' }}>
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.2rem' }}>
                    {toast.title}
                  </div>
                )}
                <div style={{ fontSize: '0.84375rem', color: 'var(--text-secondary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {toast.message}
                </div>
              </div>
              <button
                onClick={() => onRemove(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  flexShrink: 0,
                  transition: 'color 180ms ease'
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                title="Đóng thông báo"
              >
                <X size={15} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default LiquidToastContainer;
