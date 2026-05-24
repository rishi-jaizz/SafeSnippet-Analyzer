import React from 'react';

const CodeEditor = ({ value, onChange, language, onLanguageChange }) => {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '0.5rem'
      }}>
        <label 
          htmlFor="code-input" 
          style={{ 
            fontSize: '0.875rem', 
            fontWeight: '600', 
            color: 'var(--text-secondary)' 
          }}
        >
          Code Snippet
        </label>
        
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          style={{
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.25rem 0.5rem',
            fontSize: '0.875rem',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="php">PHP</option>
          <option value="go">Go</option>
          <option value="typescript">TypeScript</option>
        </select>
      </div>

      <textarea
        id="code-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="// Paste your code here..."
        spellCheck="false"
        style={{
          width: '100%',
          minHeight: '250px',
          backgroundColor: 'var(--bg-input)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.875rem',
          lineHeight: '1.6',
          resize: 'vertical',
          transition: 'border-color var(--transition-fast)',
          outline: 'none'
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--border-focus)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
      />
    </div>
  );
};

export default CodeEditor;
