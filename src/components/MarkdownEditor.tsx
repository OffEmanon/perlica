import { useRef, useState } from 'react';
import { Bold, Code, Columns2, Eye, Heading2, ListTodo, PenLine, Sigma } from 'lucide-react';
import { MarkdownView } from './MarkdownView.tsx';

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = '支持 Markdown、代码块（如 ```cpp）以及 LaTeX 数学公式（$x^2$ 或 $$\\int_a^b f(x)dx$$）...',
  minHeight = '240px',
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'write' | 'split' | 'preview'>('write');
  const textRef = useRef<HTMLTextAreaElement>(null);

  const insertSnippet = (before: string, after = '', sample = '') => {
    const el = textRef.current;
    if (!el) {
      onChange(value + before + sample + after);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || sample;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + before.length + selected.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="rounded-xl border border-subtle overflow-hidden bg-[var(--bg-surface)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-subtle bg-[var(--bg-elevated)] flex-wrap">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="二级标题"
            onClick={() => insertSnippet('## ', '', '小节标题')}
            className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-white/5 transition"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="加粗"
            onClick={() => insertSnippet('**', '**', '重点内容')}
            className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-white/5 transition"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="代码块"
            onClick={() => insertSnippet('\n```cpp\n', '\n```\n', '// 代码片段')}
            className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-white/5 transition"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="LaTeX 数学公式"
            onClick={() => insertSnippet('\n$$\n', '\n$$\n', '\\lim_{n \\to \\infty} x_n = L')}
            className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-white/5 transition"
          >
            <Sigma className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="列表项"
            onClick={() => insertSnippet('\n- ', '', '要点')}
            className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-white/5 transition"
          >
            <ListTodo className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center rounded-lg bg-[var(--bg-app)] p-0.5 border border-subtle text-xs">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition ${
              mode === 'write'
                ? 'bg-[var(--bg-surface)] text-primary shadow-xs'
                : 'text-muted hover:text-secondary'
            }`}
          >
            <PenLine className="w-3 h-3" /> 编辑
          </button>
          <button
            type="button"
            onClick={() => setMode('split')}
            className={`hidden md:flex items-center gap-1 px-2 py-1 rounded-md transition ${
              mode === 'split'
                ? 'bg-[var(--bg-surface)] text-primary shadow-xs'
                : 'text-muted hover:text-secondary'
            }`}
          >
            <Columns2 className="w-3 h-3" /> 分栏
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition ${
              mode === 'preview'
                ? 'bg-[var(--bg-surface)] text-primary shadow-xs'
                : 'text-muted hover:text-secondary'
            }`}
          >
            <Eye className="w-3 h-3" /> 预览
          </button>
        </div>
      </div>

      {/* Body */}
      <div className={mode === 'split' ? 'grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]' : ''}>
        {(mode === 'write' || mode === 'split') && (
          <textarea
            ref={textRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ minHeight }}
            className="w-full p-3.5 bg-transparent text-primary placeholder:text-muted text-sm font-mono leading-relaxed focus:outline-none resize-y"
          />
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div style={{ minHeight }} className="p-3.5 overflow-y-auto max-h-[520px]">
            <MarkdownView content={value} />
          </div>
        )}
      </div>
    </div>
  );
}
