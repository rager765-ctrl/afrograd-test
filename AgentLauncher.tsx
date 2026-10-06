import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Sparkles } from 'lucide-react';
import type { AgentId, AgentCatalogItem } from '../services/agentCatalog';
import { AgentMark } from './chat/AgentMark';
import { AiPersona, type AiPersonaState } from './ai-ui/AiPersona';
import { AiAgentCard } from './ai-ui/AiAgentCard';

interface AgentLauncherProps {
  agents: readonly AgentCatalogItem[];
  selectedAgentId: AgentId;
  onSelect: (agentId: AgentId) => void;
  onAction?: (agentId: AgentId) => void;
  actionLabel?: string;
  mode?: 'preview' | 'popover';
  personaState?: AiPersonaState;
}

export const AgentLauncher: React.FC<AgentLauncherProps> = ({
  agents,
  selectedAgentId,
  onSelect,
  onAction,
  actionLabel = 'Start with this coach',
  mode = 'preview',
  personaState = 'idle',
}) => {
  const selected = agents.find((agent) => agent.id === selectedAgentId) || agents[0];
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!isOpen || mode !== 'popover') return;
    optionRefs.current[selected.id]?.focus();
  }, [isOpen, mode, selected.id]);

  useEffect(() => {
    if (!isOpen || mode !== 'popover') return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!listRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const currentIndex = agents.findIndex((agent) => agent.id === selected.id);
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? agents.length - 1 : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + agents.length) % agents.length;
      const next = agents[nextIndex];
      onSelect(next.id);
      optionRefs.current[next.id]?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [agents, isOpen, mode, onSelect, selected.id]);

  if (mode === 'popover') {
    return (
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="agent-launcher-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls="afrograd-agent-launcher"
          aria-label={`Change coach. Current: ${selected.name}, ${selected.roleTitle}`}
        >
          <AiPersona agent={selected} state={personaState} compact avatarDecorative className="min-w-0 text-left" />
          <ChevronDown className={`ml-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {isOpen && (
          <div ref={listRef} id="afrograd-agent-launcher" role="listbox" aria-label="Choose an AI coach" className="agent-launcher-popover">
            <div className="border-b border-slate-100 px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Choose a coach</p>
              <p className="mt-1 text-xs text-slate-500">Each coach keeps a focused conversation.</p>
            </div>
            <AiAgentCard agent={selected} state={personaState} className="mx-2 mt-2" />
            <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
              {agents.map((agent) => {
                const active = agent.id === selected.id;
                return (
                  <button
                    key={agent.id}
                    ref={(element) => { optionRefs.current[agent.id] = element; }}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { onSelect(agent.id); setIsOpen(false); triggerRef.current?.focus(); }}
                    className={`agent-launcher-option ${active ? 'agent-launcher-option-active' : ''}`}
                  >
                    <AgentMark agent={agent} className="h-10 w-10 shrink-0 rounded-xl" />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-2 text-sm font-bold text-slate-900">{agent.name}<span className="text-[10px] font-semibold text-slate-400">{agent.roleTitle}</span></span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">{agent.tagline}</span>
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="agent-preview-grid">
      <div className="agent-preview-list" role="tablist" aria-label="Jeli specialists">
        {agents.map((agent, index) => {
          const active = agent.id === selected.id;
          return (
            <button
              key={agent.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`agent-preview-${agent.id}`}
              onClick={() => onSelect(agent.id)}
              className={`agent-preview-card ${active ? 'agent-preview-card-active' : ''}`}
              style={{ '--agent-delay': `${index * 35}ms` } as React.CSSProperties}
            >
              <AgentMark agent={agent} className="h-11 w-11 rounded-xl" />
              <span className="min-w-0 flex-1 text-left"><span className="block text-sm font-bold text-slate-900">{agent.name}</span><span className="block truncate text-xs text-slate-500">{agent.roleTitle}</span></span>
              {active && <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div id={`agent-preview-${selected.id}`} role="tabpanel" className="agent-preview-detail">
        <div className="flex items-start gap-4">
          <AgentMark agent={selected} className="h-14 w-14 shrink-0 rounded-2xl border border-white/60 shadow-sm" />
          <div><p className="ag-eyebrow">Your AI coach</p><h3 className="mt-1 text-2xl font-semibold text-secondary-900">{selected.name}, {selected.roleTitle}</h3><p className="mt-2 text-sm leading-6 text-fg-muted">{selected.tagline}</p></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {selected.quickPrompts.slice(0, 3).map((prompt) => <button key={prompt} type="button" onClick={() => onAction?.(selected.id)} className="agent-prompt-chip"><Sparkles className="h-3.5 w-3.5 text-brand-600" />{prompt}</button>)}
        </div>
        {onAction && <button type="button" onClick={() => onAction(selected.id)} className="ag-text-link mt-6">{actionLabel}<ArrowRight className="h-4 w-4" /></button>}
      </div>
    </div>
  );
};
