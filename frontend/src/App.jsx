import React, { useState, useRef } from 'react';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import CodeEditor from './components/CodeEditor';
import StatusBar from './components/StatusBar';
import VulnerabilityCard from './components/VulnerabilityCard';

function App() {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [status, setStatus] = useState(null); // 'pending', 'processing', 'completed', 'error'
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [showRawJson, setShowRawJson] = useState(false);
  
  const pollIntervalRef = useRef(null);

  const startAnalysis = async () => {
    if (!code.trim()) {
      setStatus('error');
      setMessage('Please paste a code snippet before analyzing.');
      return;
    }

    // Reset state
    setStatus('pending');
    setMessage('Submitting code for analysis...');
    setResult(null);
    setShowRawJson(false);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language })
      });

      const data = await response.json();

      if (!data.success) {
        setStatus('error');
        setMessage(data.error || 'Submission failed.');
        return;
      }

      setStatus('processing');
      setMessage(`Job queued (${data.jobId.slice(0, 8)}...). Waiting for AI analysis...`);
      startPolling(data.jobId);
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Network error — is the Express backend running on port 3000?');
    }
  };

  const startPolling = (jobId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/results/${jobId}`);
        const data = await res.json();

        if (data.status === 'completed') {
          clearInterval(pollIntervalRef.current);
          setStatus('completed');
          setMessage('Analysis completed successfully!');
          setResult(data.result);
        } else if (data.status === 'failed') {
          clearInterval(pollIntervalRef.current);
          setStatus('error');
          setMessage(`Analysis failed: ${data.error}`);
        } else {
          setMessage(`Status: ${data.status}... AI is analyzing your code.`);
        }
      } catch (err) {
        // Ignore transient network errors during polling
        console.warn('Polling error:', err);
      }
    }, 2000);
  };

  const renderResults = () => {
    if (!result) return null;

    const riskLevelColors = {
      CRITICAL: 'rgba(239, 68, 68, 0.15)',
      HIGH: 'rgba(245, 158, 11, 0.15)',
      MEDIUM: 'rgba(59, 130, 246, 0.15)',
      LOW: 'rgba(16, 185, 129, 0.15)',
      SAFE: 'rgba(16, 185, 129, 0.15)'
    };
    
    const riskLevelTextColors = {
      CRITICAL: '#fca5a5',
      HIGH: '#fcd34d',
      MEDIUM: '#93c5fd',
      LOW: '#6ee7b7',
      SAFE: '#6ee7b7'
    };

    return (
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📋 Analysis Report
          </h2>
          <span style={{ 
            padding: '0.35rem 0.85rem', 
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: '700',
            letterSpacing: '0.05em',
            backgroundColor: riskLevelColors[result.riskLevel] || 'rgba(107, 114, 128, 0.15)',
            border: `1px solid ${riskLevelColors[result.riskLevel] || 'rgba(107, 114, 128, 0.3)'}`,
            color: riskLevelTextColors[result.riskLevel] || 'var(--text-secondary)'
          }}>
            {result.riskLevel} RISK
          </span>
        </div>

        <div style={{ 
          backgroundColor: 'var(--bg-surface-elevated)', 
          padding: '1rem 1.25rem', 
          borderRadius: 'var(--radius-md)',
          borderLeft: '4px solid var(--accent-primary)',
          marginBottom: '2rem',
          color: 'var(--text-secondary)',
          fontSize: '0.95rem',
          lineHeight: '1.6'
        }}>
          {result.summary}
        </div>

        {result.vulnerabilities && result.vulnerabilities.length > 0 ? (
          result.vulnerabilities.map((vuln, idx) => (
            <VulnerabilityCard key={idx} vuln={vuln} />
          ))
        ) : (
          <p style={{ color: 'var(--accent-success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={20} />
            No vulnerabilities detected in this snippet.
          </p>
        )}

        <div style={{ marginTop: '2rem' }}>
          <button 
            onClick={() => setShowRawJson(!showRawJson)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              padding: '0.5rem 1rem',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              transition: 'all var(--transition-fast)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
          >
            {showRawJson ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showRawJson ? 'Hide Raw JSON' : 'View Raw JSON'}
          </button>

          {showRawJson && (
            <pre style={{ 
              marginTop: '1rem',
              padding: '1.25rem', 
              backgroundColor: 'var(--bg-input)', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              overflowX: 'auto',
              fontSize: '0.8125rem',
              color: 'var(--accent-info)',
              fontFamily: 'var(--font-mono)'
            }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem', position: 'relative', zIndex: 1 }}>
      <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          padding: '0.35rem 1rem', 
          borderRadius: '9999px',
          background: 'var(--gradient-glow)',
          border: '1px solid rgba(99,102,241,0.25)',
          color: '#818cf8',
          fontSize: '0.8125rem',
          fontWeight: '600',
          letterSpacing: '0.05em',
          marginBottom: '1.5rem'
        }}>
          <Shield size={14} /> AI-POWERED SECURITY
        </div>
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: '700', 
          marginBottom: '0.75rem',
          background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          SafeSnippet Analyzer
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '600px', margin: '0 auto' }}>
          Paste your code below and let AI identify security vulnerabilities, insecure patterns, and compliance risks.
        </p>
      </header>

      <main className="glass-card" style={{ padding: '2rem' }}>
        <CodeEditor 
          value={code} 
          onChange={setCode} 
          language={language} 
          onLanguageChange={setLanguage} 
        />
        
        <button 
          onClick={startAnalysis}
          disabled={status === 'pending' || status === 'processing'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.875rem',
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-hover) 100%)',
            color: 'white',
            fontWeight: '600',
            fontSize: '1rem',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-glow)',
            opacity: (status === 'pending' || status === 'processing') ? 0.7 : 1,
            cursor: (status === 'pending' || status === 'processing') ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast)'
          }}
        >
          {status === 'pending' || status === 'processing' ? (
            <><Loader2 size={18} className="animate-spin" /> Analyzing...</>
          ) : (
            <><Shield size={18} /> Analyze for Vulnerabilities</>
          )}
        </button>

        <StatusBar status={status} message={message} />
      </main>

      {renderResults()}
    </div>
  );
}

export default App;
