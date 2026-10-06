import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { CheckSquare, Copy, ExternalLink, FileText, Globe2, Image, ListChecks, X } from 'lucide-react';
import { normalizeMathDelimiters } from '../services/mathParser';

export type ChatArtifactType = 'document' | 'plan' | 'task-list' | 'sources' | 'media' | 'draft';
export interface ArtifactSource { title: string; url: string; snippet?: string; }
export interface ChatArtifact {
  id: string;
  title: string;
  type: ChatArtifactType;
  content: string;
  createdAt: string;
  sourceMessageIndex: number;
  sources?: ArtifactSource[];
}

const sourceRegex = /https?:\/\/[^\s)\]]+/g;
export const extractArtifacts = (content: string, sourceMessageIndex: number): ChatArtifact[] => {
  if (!content.trim()) return [];
  const urls = Array.from(new Set(content.match(sourceRegex) || [])).map((url) => url.replace(/[.,;:]$/, ''));
  const artifacts: ChatArtifact[] = [];
  const stamp = new Date().toISOString();
  const baseId = `artifact-${sourceMessageIndex}`;
  const tasks = Array.from(content.matchAll(/\[TASK:\s*([^|\]]+)(?:\|[^\]]+)?\]/g)).map((match) => `- [ ] ${match[1].trim()}`);
  if (tasks.length) artifacts.push({ id: `${baseId}-tasks`, title: 'Action plan', type: 'task-list', content: tasks.join('\n'), createdAt: stamp, sourceMessageIndex });
  if (urls.length) artifacts.push({ id: `${baseId}-sources`, title: `${urls.length} source${urls.length === 1 ? '' : 's'}`, type: 'sources', content: '', createdAt: stamp, sourceMessageIndex, sources: urls.map((url) => ({ title: new URL(url).hostname.replace(/^www\./, ''), url })) });
  if (content.length > 650 || /\b(plan|outline|draft|proposal|curriculum|roadmap)\b/i.test(content)) {
    const titleMatch = content.match(/^#{1,3}\s+(.+)$/m);
    artifacts.push({ id: `${baseId}-document`, title: titleMatch?.[1] || 'Generated document', type: /draft|proposal/i.test(content) ? 'draft' : /plan|roadmap|outline/i.test(content) ? 'plan' : 'document', content, createdAt: stamp, sourceMessageIndex });
  }
  return artifacts;
};

const artifactIcon = { document: FileText, plan: ListChecks, 'task-list': CheckSquare, sources: Globe2, media: Image, draft: FileText };

export const ArtifactPanel: React.FC<{ artifact: ChatArtifact; onClose: () => void }> = ({ artifact, onClose }) => {
  const Icon = artifactIcon[artifact.type];
  return (
    <aside className="artifact-panel" aria-label={`${artifact.title} artifact`}>
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary-50 text-secondary-800"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{artifact.title}</p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{artifact.type.replace('-', ' ')}</p></div></div>
        <div className="flex items-center gap-1"><button type="button" onClick={() => navigator.clipboard.writeText(artifact.content || artifact.sources?.map((s) => s.url).join('\n') || '')} className="icon-button" aria-label="Copy artifact"><Copy className="h-4 w-4" /></button><button type="button" onClick={onClose} className="icon-button" aria-label="Close artifact"><X className="h-4 w-4" /></button></div>
      </header>
      <div className="custom-scrollbar flex-1 overflow-y-auto p-5">
        {artifact.sources?.length ? <div className="space-y-3">{artifact.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="group block rounded-2xl border border-slate-200 bg-surface p-4 transition hover:border-brand-200 hover:shadow-sm"><div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-900">{source.title}</p><ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-brand-600" /></div><p className="mt-2 break-all text-xs text-slate-500">{source.url}</p>{source.snippet && <p className="mt-2 text-sm leading-6 text-slate-600">{source.snippet}</p>}</a>)}</div> : <div className="prose prose-sm max-w-none text-slate-700"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMathDelimiters(artifact.content)}</ReactMarkdown></div>}
      </div>
    </aside>
  );
};
