import React from 'react';
import { Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react';

const StatusBar = ({ status, message }) => {
  if (!status) return null;

  const config = {
    pending: {
      icon: Clock,
      color: 'var(--accent-warning)',
      bg: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.2)'
    },
    processing: {
      icon: Loader2,
      color: 'var(--accent-primary)',
      bg: 'rgba(99, 102, 241, 0.1)',
      border: 'rgba(99, 102, 241, 0.2)',
      spin: true
    },
    completed: {
      icon: CheckCircle,
      color: 'var(--accent-success)',
      bg: 'rgba(16, 185, 129, 0.1)',
      border: 'rgba(16, 185, 129, 0.2)'
    },
    error: {
      icon: AlertCircle,
      color: 'var(--accent-danger)',
      bg: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.2)'
    }
  };

  const activeConfig = config[status] || config.pending;
  const Icon = activeConfig.icon;

  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem 1.25rem',
        marginTop: '1.5rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: activeConfig.bg,
        border: `1px solid ${activeConfig.border}`,
        color: activeConfig.color,
        fontSize: '0.875rem',
        fontWeight: '500',
        animation: 'pulse-subtle 2s infinite'
      }}
    >
      <Icon 
        size={18} 
        className={activeConfig.spin ? 'animate-spin' : ''} 
      />
      <span>{message}</span>
    </div>
  );
};

export default StatusBar;
