import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Download, Trash2 } from 'lucide-react';
import { logger, LogEntry } from '../utils/logger';

interface DebugModalProps {
  onClose: () => void;
}

export function DebugModal({ onClose }: DebugModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs([...logger.getLogs()]);
    const unsubscribe = logger.subscribe(() => {
      setLogs([...logger.getLogs()]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logger.getFormattedLogs());
      alert('Logs copied to clipboard!');
    } catch (err) {
      alert('Failed to copy logs.');
    }
  };

  const handleSave = () => {
    const blob = new Blob([logger.getFormattedLogs()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashcam-debug-${new Date().toISOString().replace(/:/g, '-')}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-2xl flex flex-col h-[80vh] shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Debug Logs</h2>
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs text-white/80 space-y-1 bg-black/50">
          {logs.length === 0 ? (
            <div className="text-white/40 italic flex items-center justify-center h-full">No logs yet...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="break-words">
                <span className="text-white/40">[{log.timestamp.toLocaleTimeString()}]</span>{' '}
                <span className={log.source === 'HR' ? 'text-red-400' : log.source === 'PM' ? 'text-blue-400' : 'text-emerald-400'}>[{log.source}]</span>{' '}
                {log.message}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 border-t border-white/10 flex gap-3 bg-zinc-900 rounded-b-xl">
          <button onClick={handleCopy} className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            <Copy className="w-4 h-4" /> Copy
          </button>
          <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
            <Download className="w-4 h-4" /> Save to File
          </button>
          <button onClick={() => logger.clear()} className="flex items-center justify-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors" title="Clear Logs">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
