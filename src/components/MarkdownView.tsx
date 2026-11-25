import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export function MarkdownView({ content, className = '' }: MarkdownViewProps) {
  if (!content.trim()) {
    return <p className="text-sm text-muted italic">暂无内容</p>;
  }
  return (
    <div className={`md-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
