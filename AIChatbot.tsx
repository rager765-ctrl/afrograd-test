import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Job, Course } from '../types';
import { AgentAction, AgentId } from '../services/agentGraph';
import { afrogradAgentCatalog } from '../services/agentCatalog';
import type { LearningCard } from '../services/pythonApiClient';
import { Brain, PanelLeft } from 'lucide-react';

import { getSystemInstruction as buildSystemInstruction } from '../services/prompts/agents';
import { db } from '../services/db';
import { ArtifactPanel, ChatArtifact } from './ChatArtifacts';
import { useAiMemory } from '../hooks/useAiMemory';
import { useChatSessions, type ChatSession } from '../hooks/useChatSessions';
import { useAiUsageLimits } from '../hooks/useAiUsageLimits';
import { useChatTurn } from '../hooks/useChatTurn';
import { AgentAvatar } from './chat/AgentMark';
import { AgentSidebar } from './chat/AgentSidebar';
import { MessageStream, parseMessageDetails, parseResponseContent, type EvidenceItem } from './chat/MessageStream';
import { Composer } from './chat/Composer';
import { MemoryDrawer } from './chat/MemoryDrawer';
import { ToolPanel, type ChatToolId } from './chat/ToolPanel';
import type { Agent } from './chat/types';
import { AiReasoningSummary } from './ai-ui/AiReasoningSummary';
import { AiToolCall } from './ai-ui/AiToolCall';
import type { AiActivityItem } from './ai-ui/types';

interface AIChatbotProps {
  user: UserProfile;
  jobs: Job[];
  courses: Course[];
  onApplyJob: (id: string) => Promise<void>;
  onEnrollCourse: (id: string) => Promise<void>;
  onViewJobDetails?: (id: string) => void;
  onViewCourseDetails?: (id: string) => void;
  initialAgent?: AgentId;
  onCreateCustomCourse?: (title: string, description: string, tasks: { title: string; duration: string }[]) => Promise<void>;
  adminMode?: boolean;
  onOpenCourseFactory?: (brief?: string) => void;
  onJobDraftReady?: (job: Record<string, any>) => void;
  onEventDraftReady?: (event: Record<string, any>) => void;
  onProfileUpdated?: () => void;
}

const THINKING_PHRASES = ['Thinking...', 'Analyzing...', 'Crafting response...', 'Almost there...'];

export const AIChatbot: React.FC<AIChatbotProps> = ({
  user,
  jobs,
  courses,
  onApplyJob,
  onEnrollCourse,
  onViewJobDetails,
  onViewCourseDetails,
  initialAgent = 'career',
  onCreateCustomCourse,
  adminMode = false,
  onOpenCourseFactory,
  onJobDraftReady,
  onEventDraftReady,
  onProfileUpdated
}) => {
  const [activeAgentId, setActiveAgentId] = useState<AgentId>(initialAgent);
  const [inputMessage, setInputMessage] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('afrograd_ai_chat_sidebar_open') === 'true';
  });
  const openSidebar = () => {
    setSidebarOpen(true);
    localStorage.setItem('afrograd_ai_chat_sidebar_open', 'true');
  };
  const closeSidebar = () => {
    setSidebarOpen(false);
    localStorage.setItem('afrograd_ai_chat_sidebar_open', 'false');
  };
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSidebar();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);
  /** Transient handoff banner: the target agent plus the server's stated reason. */
  const [handoffNotice, setHandoffNotice] = useState<{ agentId: AgentId; reason?: string | null } | null>(null);
  const [isAgentPanelMinimized] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('afrograd_ai_agent_panel_preference_v4_set') === 'true'
      ? localStorage.getItem('afrograd_ai_agent_panel_minimized') === 'true'
      : false;
  });
  const [hasAgentPanelPreference] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('afrograd_ai_agent_panel_preference_v4_set') === 'true';
  });
  const [isAgentPanelAutoCollapsed, setIsAgentPanelAutoCollapsed] = useState(false);
  const [shouldAutoMinimizeAgentPanel, setShouldAutoMinimizeAgentPanel] = useState(false);

  useEffect(() => {
    if (!hasAgentPanelPreference) return;
    localStorage.setItem('afrograd_ai_agent_panel_minimized', String(isAgentPanelMinimized));
    localStorage.setItem('afrograd_ai_agent_panel_preference_v4_set', 'true');
  }, [hasAgentPanelPreference, isAgentPanelMinimized]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncAgentPanelMode = () => {
      setShouldAutoMinimizeAgentPanel(false);
    };

    syncAgentPanelMode();
    window.addEventListener('resize', syncAgentPanelMode);
    return () => window.removeEventListener('resize', syncAgentPanelMode);
  }, []);

  const isAgentPanelCompact = isAgentPanelAutoCollapsed || (hasAgentPanelPreference ? isAgentPanelMinimized : shouldAutoMinimizeAgentPanel);

  const [pendingAction, setPendingAction] = useState<AgentAction | null>(null);
  const [learningCards, setLearningCards] = useState<LearningCard[]>([]);
  const [retrievedEvidence, setRetrievedEvidence] = useState<EvidenceItem[]>([]);
  const [activeArtifact, setActiveArtifact] = useState<ChatArtifact | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [thinkingPhase, setThinkingPhase] = useState(0);
  const [activeTool, setActiveTool] = useState<ChatToolId | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agents: Agent[] = afrogradAgentCatalog.map((agent) => ({
    ...agent,
    initialMessage: agent.initialMessage(user.name.split(' ')[0]),
  }));
  const activeAgent = agents.find(a => a.id === activeAgentId) || agents[0];
  const isZaraActive = activeAgentId === 'learning';
  /** Lets the thinking trace name coaches the way the rest of the UI does. */
  const agentNames = React.useMemo(
    () => Object.fromEntries(agents.map((agent) => [agent.id, agent.name])),
    [agents.map((agent) => agent.id).join(',')],
  );

  const memory = useAiMemory({ user });
  const {
    memoryConsent,
    canManageMemory,
    memories,
    learnerState,
    showMemoryPanel,
    setShowMemoryPanel,
    newMemoryText,
    setNewMemoryText,
    newMemoryFeedback,
    setNewMemoryFeedback,
    parseAndSaveMemories,
  } = memory;

  useEffect(() => {
    if (!showMemoryPanel) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMemoryPanel(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showMemoryPanel, setShowMemoryPanel]);

  const chat = useChatSessions({ user, memoryEnabled: memoryConsent?.memoryEnabled, canManageMemory });
  const { conversationId, setConversationId, histories, setHistories, sessions } = chat;

  // New turns use one coordinator transcript. Per-agent keys remain readable for
  // backwards-compatible history migration and old saved sessions.
  const currentMessages = histories.coordinator || histories[activeAgentId] || [];

  const usage = useAiUsageLimits({
    user,
    activeAgentId,
    isGenerating,
    inputMessage,
    activeAgentName: activeAgent.name,
  });

  // System Instructions Builder — assembled in services/prompts/agents.ts
  const getSystemInstruction = (agentId: AgentId): string =>
    buildSystemInstruction(agentId, { user, memories, jobs, courses });

  const getAgentInstructions = (): Record<AgentId, string> => ({
    career: getSystemInstruction('career'),
    learning: getSystemInstruction('learning'),
    startup: getSystemInstruction('startup'),
    academic: getSystemInstruction('academic'),
    memory: getSystemInstruction('memory'),
    job_creator: getSystemInstruction('job_creator'),
    event_planner: getSystemInstruction('event_planner'),
  });

  const { streamStarted, thinkingSteps, thinkingTraces, handleSendMessage, handleEditSubmit, handleRegenerate } = useChatTurn({
    user,
    conversationId,
    setConversationId,
    currentMessages,
    setHistories,
    activeAgentId,
    setActiveAgentId,
    getAgentInstructions,
    memories,
    learnerState,
    parseAndSaveMemories,
    checkAndIncrementUsage: usage.checkAndIncrementUsage,
    isGenerating,
    setIsGenerating,
    webSearchEnabled,
    setInputMessage,
    inputRef,
    editDraft,
    setEditDraft,
    setEditingIndex,
    setHandoffNotice,
    setRetrievedEvidence,
    setLearningCards,
    setPendingAction,
    agentNames,
    onJobDraftReady,
    onEventDraftReady,
  });

  // Synchronize agent tab if initialAgent prop changes
  useEffect(() => {
    setActiveAgentId(initialAgent);
  }, [initialAgent]);

  useEffect(() => {
    if (!inputMessage.trim() || isAgentPanelCompact) return;

    const collapseAfterTyping = window.setTimeout(() => {
      setIsAgentPanelAutoCollapsed(true);
    }, 1000);

    return () => window.clearTimeout(collapseAfterTyping);
  }, [inputMessage, isAgentPanelCompact]);

  // Thinking animation
  useEffect(() => {
    if (!isGenerating) { setThinkingPhase(0); return; }
    const interval = setInterval(() => setThinkingPhase(p => (p + 1) % THINKING_PHRASES.length), 2200);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const handleCopyMessage = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(msgId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handleSaveChat = () => {
    if (currentMessages.length <= 1) return; // Nothing to save

    // Format conversation history into text
    let formattedText = `AfroGrad Chat Log Export\n`;
    formattedText += `Agent: ${activeAgent.name} (${activeAgent.roleTitle})\n`;
    formattedText += `Date: ${new Date().toLocaleString()}\n`;
    formattedText += `========================================\n\n`;

    currentMessages.forEach(msg => {
      const roleName = msg.role === 'user' ? 'You' : activeAgent.name;
      const { cleanText } = parseResponseContent(msg.content, jobs, courses);
      const { cleanText: finalCleanText } = parseMessageDetails(cleanText, 0);

      const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
      formattedText += `[${timeStr}] ${roleName}:\n${finalCleanText}\n\n`;
    });

    // Trigger download of the file
    const blob = new Blob([formattedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeAgent.name.toLowerCase()}-chat-export.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openCourseWorkspace = (brief = '') => {
    if (activeAgentId !== 'learning') {
      chat.archiveCurrentConversation(activeAgentId);
      setActiveAgentId('learning');
    }
    onOpenCourseFactory?.(brief.trim());
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    const payload = pendingAction.payload;
    try {
      if (pendingAction.type === 'profile_update') {
        const updates: Partial<UserProfile> = {};
        const asText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
        const fields: Array<[keyof UserProfile, unknown]> = [
          ['role', payload.role], ['company', payload.company], ['location', payload.location],
          ['bio', payload.bio], ['education', payload.education], ['linkedinUrl', payload.linkedinUrl],
        ];
        fields.forEach(([key, value]) => { const text = asText(value); if (text) (updates as Record<string, unknown>)[key] = text; });
        if (Array.isArray(payload.skills)) {
          const nextSkills = payload.skills.map((skill) => String(skill).trim()).filter(Boolean);
          updates.skills = Array.from(new Set([...(user.skills || []), ...nextSkills]));
        }
        if (Object.keys(updates).length) {
          const success = await db.updateProfile(updates);
          setNewMemoryFeedback(success ? 'Profile update applied.' : 'Profile update could not be saved.');
          if (success) onProfileUpdated?.();
        }
      } else if (pendingAction.type === 'job_draft') {
        onJobDraftReady?.(payload);
        setNewMemoryFeedback('Job draft opened for review.');
      } else if (pendingAction.type === 'event_draft') {
        onEventDraftReady?.(payload);
        setNewMemoryFeedback('Event draft opened for review.');
      }
    } finally {
      setPendingAction(null);
    }
  };

  const handleQuickPromptClick = (prompt: string) => {
    if (adminMode && prompt === 'Build a course') {
      openCourseWorkspace();
      return;
    }
    // Check if it matches a structured action
    if (prompt.includes('Optimize my resume')) {
      setActiveTool('resume');
    } else if (prompt.includes('Draft an SOP outline')) {
      setActiveTool('sop');
    } else if (prompt.includes('Validate a digital logistics') || prompt.includes('Critique my startup')) {
      setActiveTool('startup');
    } else if (prompt.includes('4-week roadmap')) {
      setActiveTool('path');
    } else if (prompt.includes('AI learning strategist')) {
      setActiveTool('ai_strategist');
    } else {
      handleSendMessage(prompt);
    }
  };

  // New chat: archive the current conversation to history, then start fresh
  const handleClearHistory = () => {
    chat.archiveCurrentConversation(activeAgentId);
    setConversationId(crypto.randomUUID());
    setLearningCards([]);
    setRetrievedEvidence([]);
    setHistories(prev => ({
      ...prev,
      coordinator: [
        { role: 'model', content: activeAgent.initialMessage }
      ]
    }));
  };

  // Delete chat: discard the current conversation without archiving
  const handleDeleteChat = () => {
    setConversationId(crypto.randomUUID());
    setLearningCards([]);
    setRetrievedEvidence([]);
    setHistories(prev => ({
      ...prev,
      coordinator: [
        { role: 'model', content: activeAgent.initialMessage }
      ]
    }));
  };

  const handleRestoreSession = (session: ChatSession) => {
    setConversationId(session.id);
    setHistories(prev => ({ ...prev, coordinator: session.messages }));
    setActiveAgentId(session.agentId as AgentId);
    setActiveArtifact(session.artifacts?.[0] || null);
  };

  const handleLearningCardAction = (actionType: string) => {
    if (actionType === 'show_hint') {
      void handleSendMessage('Give me a graduated hint for the practice question you just gave me.');
    } else if (actionType === 'submit_attempt') {
      setInputMessage('My attempt: ');
      inputRef.current?.focus();
    } else if (actionType === 'ask_follow_up') {
      setInputMessage('I have a follow-up question: ');
      inputRef.current?.focus();
    }
  };

  /*
   * Runtime status, retrieval and handoffs now live in the per-turn thinking
   * trace inside the stream, next to the message they explain. This band keeps
   * only what outlives a turn and belongs to the session as a whole.
   */
  const coachActivityItems: AiActivityItem[] = ([
    retrievedEvidence.length ? { id: 'coach-sources', label: 'Reviewed available sources', detail: `${retrievedEvidence.length} source${retrievedEvidence.length === 1 ? '' : 's'} available`, status: 'complete' } : null,
    pendingAction ? { id: 'coach-confirmation', label: 'Waiting for your confirmation', detail: pendingAction.type.replace('_', ' '), status: 'pending' } : null,
  ] as (AiActivityItem | null)[]).filter((item): item is AiActivityItem => Boolean(item));

  return (
    <div className="ai-agent-workspace relative flex min-h-[620px] h-[calc(100vh-132px)] lg:h-[calc(100vh-144px)] flex-row gap-3">
      {sidebarOpen && <button type="button" className="fixed inset-0 z-40 bg-fg/30 backdrop-blur-sm xl:hidden" aria-label="Close conversations" onClick={closeSidebar} />}
      {/* Collapsible left sidebar: agents, history, memory, chat actions */}
      <AgentSidebar
        sidebarOpen={sidebarOpen}
        agents={agents}
        sessions={sessions}
        canManageMemory={canManageMemory}
        showMemoryPanel={showMemoryPanel}
        onToggleMemoryPanel={() => setShowMemoryPanel(v => !v)}
        memoryCount={memories.length}
        hasUserActivity={currentMessages.filter(m => m.timestamp).length > 0}
        canSaveChat={currentMessages.length > 1}
        onNewChat={handleClearHistory}
        onSaveChat={handleSaveChat}
        onDeleteChat={handleDeleteChat}
        onRestoreSession={handleRestoreSession}
        onDeleteSession={chat.deleteSession}
        onCloseMobile={closeSidebar}
        agentCatalog={afrogradAgentCatalog}
        selectedAgentId={activeAgentId}
        onSelectAgent={setActiveAgentId}
        personaState={isGenerating ? (streamStarted ? 'responding' : 'thinking') : 'idle'}
      />

      {/* Chat Window — full width */}
      <div className="ai-agent-chat-panel relative flex h-full min-w-0 flex-1 flex-col overflow-hidden border border-hairline bg-surface">
        {/* Chat Header */}
        <header className="flex items-center justify-between border-b border-hairline bg-surface px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={openSidebar} className="grid h-10 w-10 shrink-0 place-items-center rounded-control border border-hairline text-fg-muted transition-colors hover:bg-surface-active hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus xl:hidden" aria-label="Open conversations" aria-expanded={sidebarOpen}>
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {memoryConsent && !memoryConsent.memoryEnabled && (
              <button
                type="button"
                onClick={memory.enableAiMemory}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-hairline bg-surface-inset px-2.5 py-1 text-[10px] font-bold text-fg transition-colors hover:bg-surface-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                title="Enable consented server-side AI memory and document processing"
              >
                <Brain className="h-3 w-3 text-brand-500" aria-hidden="true" /> Enable private memory
              </button>
            )}
            {newMemoryFeedback && (
              <span className="hidden items-center gap-1 rounded-pill border border-hairline bg-surface-inset px-2 py-0.5 text-[10px] font-bold text-fg-muted md:inline-flex">
                <Brain className="h-3 w-3 text-brand-500" aria-hidden="true" />
                {newMemoryFeedback}
              </span>
            )}
          </div>
        </header>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {isGenerating ? (thinkingSteps[thinkingSteps.length - 1]?.label || `${activeAgent.name} is thinking`) : handoffNotice ? `Handing conversation to ${agents.find((agent) => agent.id === handoffNotice.agentId)?.name || 'another coach'}${handoffNotice.reason ? `. ${handoffNotice.reason}` : ''}` : pendingAction ? 'An action is ready for your confirmation' : newMemoryFeedback || ''}
        </div>
        {handoffNotice && (
          <div className="agent-handoff-banner" role="status">
            <AgentAvatar agent={agents.find((agent) => agent.id === handoffNotice.agentId) || activeAgent} className="h-6 w-6 rounded-pill" />
            <span>
              Handing you to {agents.find((agent) => agent.id === handoffNotice.agentId)?.name || 'another coach'}…
              {handoffNotice.reason && <span className="agent-handoff-reason">{handoffNotice.reason}</span>}
            </span>
          </div>
        )}
        {pendingAction && (
          <div className="flex items-center justify-between gap-3 border-b border-hairline bg-surface-inset px-5 py-2.5 text-xs">
            <span className="font-semibold text-fg">
              Review pending {pendingAction.type.replace('_', ' ')} before it is applied.
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setPendingAction(null)} className="min-h-8 rounded-control px-2.5 py-1 font-semibold text-fg-muted transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">Dismiss</button>
              <button type="button" onClick={confirmPendingAction} className="min-h-8 rounded-control bg-brand-600 px-2.5 py-1 font-bold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">Confirm</button>
            </div>
          </div>
        )}
        {adminMode && isGenerating && (
          <div className="pointer-events-none absolute left-1/2 top-11 z-20 -translate-x-1/2 rounded-pill border border-hairline bg-surface/95 px-3 py-1.5 shadow-pop backdrop-blur">
            <div className="flex items-center gap-2">
              <AgentAvatar agent={activeAgent} className="h-5 w-5 rounded-pill" />
              <span className="text-[11px] font-bold text-fg">{activeAgent.name} is working</span>
              <span className="flex gap-0.5" aria-hidden="true"><span className="h-1 w-1 rounded-pill bg-brand-500 motion-safe:animate-pulse [animation-delay:-0.6s]" /><span className="h-1 w-1 rounded-pill bg-brand-500 motion-safe:animate-pulse [animation-delay:-0.3s]" /><span className="h-1 w-1 rounded-pill bg-brand-500 motion-safe:animate-pulse" /></span>
            </div>
          </div>
        )}

        {(coachActivityItems.length > 0 || activeTool) && (
          <div className="space-y-2 border-b border-hairline bg-surface-inset px-5 py-2.5">
            <AiReasoningSummary items={coachActivityItems} current={isGenerating ? THINKING_PHRASES[thinkingPhase] : undefined} running={isGenerating} />
            {activeTool && <AiToolCall name={`${activeTool.replace('_', ' ')} tool`} status="pending" detail="Input form is ready for your review." />}
          </div>
        )}

        {/* Message stream */}
        <MessageStream
          messages={currentMessages}
          activeAgent={activeAgent}
          activeAgentId={activeAgentId}
          user={user}
          jobs={jobs}
          courses={courses}
          isGenerating={isGenerating}
          streamStarted={streamStarted}
          thinkingPhrase={THINKING_PHRASES[thinkingPhase]}
          thinkingSteps={thinkingSteps}
          thinkingTraces={thinkingTraces}
          learningCards={learningCards}
          retrievedEvidence={retrievedEvidence}
          onLearningCardAction={handleLearningCardAction}
          editingIndex={editingIndex}
          onEditingIndexChange={setEditingIndex}
          editDraft={editDraft}
          onEditDraftChange={setEditDraft}
          onEditSubmit={handleEditSubmit}
          copiedMessageId={copiedMessageId}
          onCopyMessage={handleCopyMessage}
          onSendSuggestion={(text) => { void handleSendMessage(text); }}
          onRegenerate={handleRegenerate}
          onSelectArtifact={setActiveArtifact}
          onApplyJob={onApplyJob}
          onEnrollCourse={onEnrollCourse}
          onViewJobDetails={onViewJobDetails}
          onViewCourseDetails={onViewCourseDetails}
          onCreateCustomCourse={onCreateCustomCourse}
          adminMode={adminMode}
          isZaraActive={isZaraActive}
          onOpenCourseFactory={onOpenCourseFactory}
          onOpenCourseWorkspace={openCourseWorkspace}
          messagesEndRef={messagesEndRef}
        >
          <ToolPanel
            activeTool={activeTool}
            user={user}
            agentName={activeAgent.name}
            onClose={() => setActiveTool(null)}
            onSubmitPrompt={(prompt) => { void handleSendMessage(prompt); }}
          />
        </MessageStream>

        {/* Input Bar */}
        <Composer
          inputMessage={inputMessage}
          onInputMessageChange={setInputMessage}
          inputRef={inputRef}
          isGenerating={isGenerating}
          activeAgent={activeAgent}
          activeAgentId={activeAgentId}
          adminMode={adminMode}
          showQuickPrompts={currentMessages.length === 1}
          onQuickPrompt={handleQuickPromptClick}
          onSend={handleSendMessage}
          documentProcessingEnabled={memoryConsent?.documentProcessingEnabled === true}
          onFeedback={setNewMemoryFeedback}
          webSearchEnabled={webSearchEnabled}
          onToggleWebSearch={() => setWebSearchEnabled((prev) => !prev)}
          usageLimit={usage.usageLimit}
          userTodayUsage={usage.userTodayUsage}
          usageLimitReached={usage.usageLimitReached}
          niaTodayUsage={usage.niaTodayUsage}
          niaLimitReached={usage.niaLimitReached}
        />

        {/* Memory Drawer Overlay */}
        {canManageMemory && showMemoryPanel && (
          <MemoryDrawer
            memories={memories}
            newMemoryText={newMemoryText}
            onNewMemoryTextChange={setNewMemoryText}
            onAddMemory={memory.handleAddMemory}
            onDeleteMemory={memory.handleDeleteMemory}
            retentionDays={memoryConsent?.retentionDays || 365}
            onRetentionChange={(days) => void memory.updateMemoryRetention(days)}
            onDeleteAllAiData={() => void memory.handleDeleteAllAiData(chat.clearLocalChatState)}
            onClose={() => setShowMemoryPanel(false)}
          />
        )}

      </div>
      {activeArtifact && (
        <div className="absolute inset-0 z-40 flex justify-end bg-fg/20 p-2 backdrop-blur-[2px] xl:static xl:z-auto xl:w-[34%] xl:min-w-[320px] xl:max-w-[480px] xl:bg-transparent xl:p-0 xl:backdrop-blur-none">
          <ArtifactPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />
        </div>
      )}
    </div>
  );
};
