import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  AlertTriangle,
  Loader2,
  SquarePen,
  X,
  History,
  Download,
  Menu,
  PanelRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeMathDelimiters } from '../services/mathParser';
import { Button } from './Button';
import { ChatMessage, callAIService } from '../services/geminiService';
import { runUnifiedChatTurn } from '../services/chatRuntime';
import type { ChatEvent } from '../services/pythonApiClient';
import { afrogradAgentCatalog } from '../services/agentCatalog';
import type { AgentId } from '../services/agentCatalog';
import { generateZaraCourseDraft, buildApprovedCourse, repairCourseDraftTopics, ZaraCourseDraft } from '../services/courseBuilder';
import { ResearchResult, deepReadSources, searchCourseKnowledge, searchCourseResearchDetailed } from '../services/researchService';
import { formatEngineSummary, pickDeepReadUrls } from '../services/researchSelect';
import { hasPythonApi, uploadLocalKnowledge } from '../services/pythonApiClient';
import { CourseArtifact, CourseBuildSettings } from '../types';
import { db } from '../services/db';
import {
  extractPdfTextForCourseBuilder as extractPdfText,
  extractDocxTextForCourseBuilder as extractDocxText,
} from '../services/documentExtraction';
import { usePersistedState, usePersistedBooleanFlag } from '../hooks/usePersistedState';
import { makeResearchSteps, useCourseSetupWizard } from '../hooks/useCourseSetupWizard';
import { useBuildEventStream } from '../hooks/useBuildEventStream';
import { runLocalAgentBuild } from '../services/localAgentBuild';
import {
  DEFAULT_GENERATION_GUIDANCE,
  assistantInstruction,
  dedupeSources,
  extractJson,
  fileKindLabels,
  isAssessment,
  isProject,
  isUuid,
} from '../services/prompts/courseEditor';
import { stripReadyMarker } from '../services/courseChat';
import { ChatSurface } from './builder/ChatSurface';
import { ResearchSurface } from './builder/ResearchSurface';
import { OutlineSurface } from './builder/OutlineSurface';
import { BuildSurface } from './builder/BuildSurface';
import { ReviewSurface } from './builder/ReviewSurface';
import { ArtifactsSurface } from './builder/ArtifactsSurface';
import { AiComposerShell } from './ai-ui/AiComposerShell';
import { AiMessage } from './ai-ui/AiMessage';
import { AiActivityList } from './ai-ui/AiActivityList';
import { AiScrollToLatest } from './ai-ui/AiScrollToLatest';
import { AiInlineCitation, extractCitationMarkers, stripCitationMarkers } from './ai-ui/AiInlineCitation';
import { AiReasoningSummary } from './ai-ui/AiReasoningSummary';
import { AiPersona } from './ai-ui/AiPersona';
import { createCourseSurfaceContext, fileKindFromMime, toAiAttachmentViews, toAiActivityItem, toAiSourceViews } from './ai-ui/adapters';
import type {
  ActivityStatus,
  AgentActivity,
  CourseAttachment,
  CourseBuilderWorkspaceV3Props as Props,
  FileKind,
  OutlineStreamStep,
  ResearchStep,
  StepStatus,
  Surface,
  SurfaceStatus,
} from './builder/types';

const initialMessages = (): ChatMessage[] => [];

/**
 * Tab affordance for surface/step status. Declared at module level so React keeps
 * the same component type across renders instead of remounting the icon each time.
 */
const StatusIcon = ({ status }: { status: SurfaceStatus | StepStatus }) => {
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="In progress" />;
  if (status === 'ready' || status === 'complete') return <Check className="h-3.5 w-3.5" aria-label="Done" />;
  // A failed stage must be visible from the tab bar, not only inside the tab.
  if (status === 'failed') return <AlertTriangle className="h-3.5 w-3.5 text-red-600" aria-label="Needs attention" />;
  return null;
};

export const CourseBuilderWorkspaceV3: React.FC<Props> = ({
  conversationKey = 'new-course',
  courseId = null,
  buildJobId = null,
  fitViewport = false,
  defaultSettings,
  currentDraft,
  onDraftReady,
  onImportDraft,
  isImporting,
  launchBrief,
  launchToken = 0,
  onLaunchHandled,
  artifacts = [],
  agentRuns = [],
  recentBuilds = [],
  activeBuildId = null,
  onSelectRecentBuild,
  onStartNewBuild,
  userName,
}) => {
  const [buildSidebarOpen, setBuildSidebarOpen] = usePersistedBooleanFlag('afrograd_course_chat_sidebar_open');
  const toggleBuildSidebar = () => {
    setBuildSidebarOpen((open) => !open);
  };
  const [surface, setSurface] = usePersistedState<Surface>(
    `afrograd-course-factory-surface:${conversationKey}`,
    'chat',
  );
  const [statuses, setStatuses] = usePersistedState<Record<Surface, SurfaceStatus>>(
    `afrograd-course-factory-statuses:${conversationKey}`,
    { chat: 'ready', research: 'hidden', outline: 'hidden', build: 'hidden', review: 'hidden', artifacts: 'hidden' },
  );
  const [chatOpen, setChatOpen] = useState(true);
  const [selectedArtifact, setSelectedArtifact] = useState<any | null>(null);
  const [messages, setMessages] = usePersistedState<ChatMessage[]>(
    `afrograd-course-factory-chat:${conversationKey}`,
    initialMessages,
    { serialize: (value) => JSON.stringify(value.slice(-200)) },
  );
  const [chatConversationId, setChatConversationId] = useState<string>(() => conversationKey || crypto.randomUUID());
  const [input, setInput] = useState('');
  const [brief, setBrief] = usePersistedState<string>(
    `afrograd-course-factory-brief:${conversationKey}`,
    () => defaultSettings.prompt || '',
  );
  const [buildSettings, setBuildSettings] = usePersistedState<CourseBuildSettings>(
    `afrograd-course-factory-buildSettings:${conversationKey}`,
    defaultSettings,
  );
  const [researchEnabled, setResearchEnabled] = usePersistedState<boolean>(
    `afrograd-course-factory-researchEnabled:${conversationKey}`,
    false,
  );
  const [sources, setSources] = usePersistedState<ResearchResult[]>(
    `afrograd-course-factory-sources:${conversationKey}`,
    [],
  );
  const [steps, setSteps] = usePersistedState<ResearchStep[]>(
    `afrograd-course-factory-steps:${conversationKey}`,
    [],
  );
  const [outlineStreamSteps, setOutlineStreamSteps] = usePersistedState<OutlineStreamStep[]>(
    `afrograd-course-factory-outlineStreamSteps:${conversationKey}`,
    [],
  );
  const [liveStatus, setLiveStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [attachments, setAttachments] = useState<CourseAttachment[]>([]);
  const [localPackEnabled, setLocalPackEnabled] = usePersistedState<boolean>(
    `afrograd-course-factory-localPackEnabled:${conversationKey}`,
    false,
  );
  const [localPackStatus, setLocalPackStatus] = useState<'idle' | 'indexing' | 'ready' | 'error'>('idle');
  const [localPackMessage, setLocalPackMessage] = useState<string>('');
  const [pendingFileKind, setPendingFileKind] = useState<FileKind>('pdf');
  // Owns the two persisted wizard values and the preset handlers. Callbacks are
  // passed as thunks so they resolve the (later-declared) shell closures at call time.
  const {
    setupAnswers,
    setSetupAnswers,
    pendingQuestion,
    setPendingQuestion,
    getNextQuestion,
    updateSetupAnswers,
    selectSourcePreset,
    selectAudiencePreset,
    selectStartingLevel,
    selectCourseFeel,
    selectSizePreset,
    setupContext,
    buildAttachmentContext,
  } = useCourseSetupWizard({
    conversationKey,
    buildSettings,
    setBuildSettings,
    attachments,
    setResearchEnabled,
    setPendingFileKind,
    openFilePicker: () => { window.setTimeout(() => fileInputRef.current?.click(), 0); },
    appendLocalExchange: (userText, modelText) => appendLocalExchange(userText, modelText),
    onSizePresetChosen: (sizeLabel) => { void beginCourseDraftFromSetup(sizeLabel); },
  });
  const [activities, setActivities] = usePersistedState<AgentActivity[]>(
    `afrograd-course-factory-activities:${conversationKey}`,
    [],
  );
  const [selectedContext, setSelectedContext] = useState<string>('Course outline');
  const [copiedCourseMessageId, setCopiedCourseMessageId] = useState<string | null>(null);
  const [buildStarted, setBuildStarted] = usePersistedState<boolean>(
    `afrograd-course-factory-buildStarted:${conversationKey}`,
    false,
  );
  const handledLaunch = useRef(0);
  const buildObservedBusy = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localFolderInputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Partial<Record<Surface, HTMLButtonElement | null>>>({});
  const tabScrollerRef = useRef<HTMLDivElement>(null);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [draftSaveState, setDraftSaveState] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const serverDraftHydrated = useRef(false);
  const restoredConversationKey = useRef<string | null>(null);
  // Reactive mirror of serverDraftHydrated for effects that must re-run when
  // hydration completes (a ref flip alone never re-triggers an effect).
  const [hydrated, setHydrated] = useState(false);
  const activeBuildJobId = isUuid(buildJobId)
    ? buildJobId
    : isUuid(currentDraft?.generationJobId)
      ? currentDraft.generationJobId
      : null;

  // Owns the build-progress state cluster plus the backend build-event subscription
  // and its reconnect-on-mount effect.
  const {
    artifactProgress,
    setArtifactProgress,
    buildFeed,
    setBuildFeed,
    awaitingContinue,
    setAwaitingContinue,
    continuing,
    setContinuing,
    buildCompletedCount,
    buildTotalCount,
    setBuildTotalCount,
    connectToBuildEvents,
  } = useBuildEventStream({
    buildStarted,
    buildStatus: statuses.build,
    activeBuildJobId,
    hydrated,
    currentDraft,
    setStatuses,
    setLiveStatus,
    onDraftReady,
    appendModelMessage: (content) => appendModelMessage(content),
  });

  // When a build finishes (buildStarted + build back to 'ready'), open the
  // Review tab: the teacher/admin checks the quality report, flagged lessons,
  // and imagery there before approving the course into the library.
  useEffect(() => {
    if (!buildStarted || statuses.build !== 'ready' || !currentDraft) return;
    if (statuses.review !== 'hidden') return;
    setStatuses((prev) => ({ ...prev, review: 'ready' }));
    activateArtifact('review');
  }, [buildStarted, statuses.build, statuses.review, currentDraft]);

  useEffect(() => {
    if (!isResponding) {
      setThinkingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setThinkingStep((prev) => (prev + 1) % 3);
    }, 2500);
    return () => clearInterval(interval);
  }, [isResponding]);

  const topicCount = useMemo(() => currentDraft?.course.modules.reduce((sum, unit) => sum + unit.lessons.filter((lesson) => !isAssessment(lesson.title)).length, 0) || 0, [currentDraft]);
  const projectCount = useMemo(() => currentDraft?.course.modules.reduce((sum, unit) => sum + unit.lessons.filter((lesson) => isProject(lesson.title, lesson.activity)).length, 0) || 0, [currentDraft]);
  const completedSteps = steps.filter((step) => step.status === 'complete').length;
  const chatTimeline = useMemo(() => [
    ...messages.map((message, index) => ({ kind: 'message' as const, id: `message-${index}-${message.timestamp || index}`, timestamp: message.timestamp || new Date(0).toISOString(), message })),
    ...activities.map((activity) => ({ kind: 'activity' as const, id: `activity-${activity.id}`, timestamp: activity.timestamp, activity })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [messages, activities]);

  // Restore the server copy first, then fall back to the local cache for offline recovery.
  useEffect(() => {
    // Restore exactly once per conversation. The effect re-fires when
    // buildJobId flips null→id right after outline generation (onDraftReady
    // sets the parent's job id), and re-running the restore then would clobber
    // the fresh outline with the last debounced autosave.
    if (serverDraftHydrated.current && restoredConversationKey.current === conversationKey) return;
    let cancelled = false;
    const restore = async () => {
      setDraftSaveState('loading');
      const serverRecord = await db.getCourseEditorDraft(conversationKey, buildJobId);
      if (cancelled) return;

      if (serverRecord?.state) {
        const restored = serverRecord.state as Record<string, any>;
        if (Array.isArray(restored.messages)) setMessages(restored.messages);
        if (typeof restored.brief === 'string') setBrief(restored.brief);
        if (restored.buildSettings && typeof restored.buildSettings === 'object') setBuildSettings(restored.buildSettings);
        if (typeof restored.researchEnabled === 'boolean') setResearchEnabled(restored.researchEnabled);
        if (typeof restored.localPackEnabled === 'boolean') setLocalPackEnabled(restored.localPackEnabled);
        if (Array.isArray(restored.sources)) setSources(restored.sources);
        if (Array.isArray(restored.steps)) setSteps(restored.steps);
        if (Array.isArray(restored.outlineStreamSteps)) setOutlineStreamSteps(restored.outlineStreamSteps);
        if (restored.setupAnswers && typeof restored.setupAnswers === 'object') setSetupAnswers(restored.setupAnswers);
        if (restored.pendingQuestion !== undefined) setPendingQuestion(restored.pendingQuestion);
        if (Array.isArray(restored.activities)) setActivities(restored.activities);
        if (typeof restored.buildStarted === 'boolean') setBuildStarted(restored.buildStarted);
        if (restored.surface && ['chat', 'research', 'outline', 'build', 'review', 'artifacts'].includes(restored.surface)) setSurface(restored.surface);
        if (restored.statuses && typeof restored.statuses === 'object') setStatuses(restored.statuses);
        if (restored.currentDraft) onDraftReady(repairCourseDraftTopics(restored.currentDraft as ZaraCourseDraft, restored.brief || ''), serverRecord.jobId ?? null);
        else onDraftReady(null, serverRecord.jobId ?? null);
        setLastSavedAt(serverRecord.updatedAt);
      } else {
        try {
          const chatJson = window.localStorage.getItem(`afrograd-course-factory-chat:${conversationKey}`);
          const storedChat = chatJson ? JSON.parse(chatJson) : [];
          if (Array.isArray(storedChat) && storedChat.length > 0) {
            const cd = window.localStorage.getItem(`afrograd-course-factory-currentDraft:${conversationKey}`);
            const parsedDraft = cd ? JSON.parse(cd) : null;
            onDraftReady(parsedDraft ? repairCourseDraftTopics(parsedDraft, '') : parsedDraft, null);
          } else {
            onDraftReady(null, null);
            setStatuses({ chat: 'ready', research: 'hidden', outline: 'hidden', build: 'hidden', review: 'hidden', artifacts: 'hidden' });
            setSurface('chat');
          }
        } catch (err) {
          console.error('Failed to restore course factory session:', err);
          onDraftReady(null, null);
        }
      }

      serverDraftHydrated.current = true;
      restoredConversationKey.current = conversationKey;
      setHydrated(true);
      setDraftSaveState(serverRecord ? 'saved' : 'saving');
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [conversationKey, buildJobId]);

  // Persist the whole working session so an admin can resume on another device.
  useEffect(() => {
    if (!serverDraftHydrated.current) return;
    const timeout = window.setTimeout(async () => {
      setDraftSaveState('saving');
      const saved = await db.saveCourseEditorDraft({
        conversationKey,
        courseId,
        jobId: buildJobId,
        state: {
          currentDraft,
          messages: messages.slice(-200),
          brief,
          buildSettings,
          researchEnabled,
          localPackEnabled,
          sources,
          steps,
          outlineStreamSteps,
          setupAnswers,
          pendingQuestion,
          activities,
          buildStarted,
          surface,
          statuses,
        },
      });
      if (saved) {
        setDraftSaveState('saved');
        setLastSavedAt(new Date().toISOString());
      } else {
        setDraftSaveState('error');
      }
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [conversationKey, courseId, buildJobId, currentDraft, messages, brief, buildSettings, researchEnabled, localPackEnabled, sources, steps, outlineStreamSteps, setupAnswers, pendingQuestion, activities, buildStarted, surface, statuses]);

  // State persistence is handled by `usePersistedState` at each declaration above.
  // `currentDraft` is a prop with a conditional set/remove, so it keeps its own effect.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentDraft) {
      window.localStorage.setItem(`afrograd-course-factory-currentDraft:${conversationKey}`, JSON.stringify(currentDraft));
    } else {
      window.localStorage.removeItem(`afrograd-course-factory-currentDraft:${conversationKey}`);
    }
  }, [conversationKey, currentDraft]);

  useEffect(() => {
    if (!currentDraft || messages.length === 0) return;
    setStatuses((prev) => ({ ...prev, outline: 'ready', artifacts: artifacts.length || agentRuns.length ? 'ready' : prev.artifacts }));
  }, [currentDraft, messages.length]);

  useEffect(() => {
    if (artifacts.length || agentRuns.length) {
      setStatuses((prev) => ({ ...prev, artifacts: 'ready' }));
    }
  }, [artifacts, agentRuns]);

  useEffect(() => {
    if (!launchBrief || launchToken <= handledLaunch.current) return;
    handledLaunch.current = launchToken;
    setBrief(launchBrief);
    setBuildSettings((prev) => ({ ...prev, prompt: launchBrief }));
    setInput(launchBrief);
    onLaunchHandled?.();
  }, [launchBrief, launchToken, onLaunchHandled]);

  useEffect(() => {
    if (!buildStarted) return;
    if (isImporting) {
      buildObservedBusy.current = true;
      return;
    }
    if (!buildObservedBusy.current) return;
    setStatuses((prev) => ({ ...prev, build: 'ready' }));
    setLiveStatus('Course draft is ready for review.');
  }, [buildStarted, isImporting]);

  const activateArtifact = (next: Surface) => {
    setSurface(next);
    setChatOpen(false);
  };

  const updateStep = (id: string, status: StepStatus) => setSteps((prev) => prev.map((step) => step.id === id ? { ...step, status } : step));
  const updateOutlineStreamStep = (id: string, status: StepStatus) => setOutlineStreamSteps((prev) => prev.map((step) => step.id === id ? { ...step, status } : step));
  const setActivity = (id: string, label: string, status: ActivityStatus, detail?: string) => setActivities((prev) => {
    const existing = prev.find((activity) => activity.id === id);
    if (existing) return prev.map((activity) => activity.id === id ? { ...activity, label, status, detail } : activity);
    return [...prev, { id, label, status, detail, timestamp: new Date().toISOString() }];
  });

  const appendLocalExchange = (userText: string, modelText: string) => {
    const timestamp = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userText, timestamp },
      { role: 'model', content: modelText, timestamp: new Date(Date.now() + 1).toISOString() },
    ]);
  };

  const appendModelMessage = (content: string) => {
    setMessages((prev) => prev.some((message) => message.role === 'model' && message.content === content)
      ? prev
      : [...prev, { role: 'model', content, timestamp: new Date().toISOString() }]);
  };

  const draftOutline = async (topic: string, gathered?: ResearchResult[]) => {
    const effectiveGathered = gathered ?? sources;
    const outlinePlan: OutlineStreamStep[] = [
      { id: 'read-context', label: 'Read course brief and chat', detail: 'Using the topic, selected setup answers, and attached materials.', status: 'pending' },
      { id: 'map-units', label: 'Map unit progression', detail: 'Grouping the course into a beginner-friendly sequence.', status: 'pending' },
      { id: 'shape-topics', label: 'Shape topics and learning checks', detail: 'Adding read, flashcard, quiz, and practice moments.', status: 'pending' },
      { id: 'add-projects', label: 'Add projects and assessments', detail: 'Creating practical proof-of-skill tasks for each unit.', status: 'pending' },
      { id: 'finalize-outline', label: 'Finalize outline artifact', detail: 'Preparing the reviewable outline tab.', status: 'pending' },
    ];
    setOutlineStreamSteps(outlinePlan);
    setActivity('draft-outline', 'Drafting the course outline', 'running', 'Organizing units, topics, activities, and assessments');
    setStatuses((prev) => ({
      ...prev,
      outline: 'running',
      build: 'hidden',
      review: 'hidden',
    }));
    setBuildStarted(false);
    setArtifactProgress({});
    setBuildFeed([]);
    setBuildTotalCount(0);
    activateArtifact('outline');
    setIsDrafting(true);
    setLiveStatus('Drafting your course outline…');
    setError(null);
    try {
      for (const step of outlinePlan.slice(0, 4)) {
        updateOutlineStreamStep(step.id, 'running');
        setLiveStatus(step.label);
        await new Promise((resolve) => window.setTimeout(resolve, 360));
        updateOutlineStreamStep(step.id, 'complete');
      }
      updateOutlineStreamStep('finalize-outline', 'running');
      const referenceBlock = effectiveGathered.map((source, index) => `[${index + 1}] ${source.title}\nURL: ${source.url}\n${source.content ? source.content.slice(0, 2400) : source.snippet}`).join('\n\n');
      const result = await generateZaraCourseDraft({
        ...buildSettings,
        prompt: topic.trim(),
      }, referenceBlock);
      onDraftReady(repairCourseDraftTopics(result.draft, topic), result.job?.id ?? null);
      updateOutlineStreamStep('finalize-outline', 'complete');
      setActivity('draft-outline', 'Course outline ready', 'complete', `${result.draft.course.modules.length} units designed`);
      setLiveStatus('Outline ready for review');
      setStatuses((prev) => ({ ...prev, outline: 'ready' }));
      activateArtifact('outline');
    } catch (draftError) {
      setActivity('draft-outline', 'Failed to draft outline', 'failed', (draftError as Error).message);
      updateOutlineStreamStep('finalize-outline', 'failed');
      updateStep('outline', 'failed');
      setError((draftError as Error).message);
    } finally {
      setIsDrafting(false);
    }
  };

  async function beginCourseDraftFromSetup(sizeLabel?: string) {
    if (isDrafting || isResponding) return;
    onDraftReady(null, null);
    const topic = brief.trim() || input.trim() || buildSettings.prompt.trim();
    if (!topic) {
      appendModelMessage('Please type your course topic or goal in the chat box below to begin drafting the outline.');
      setPendingQuestion(null);
      return;
    }
    setBrief(topic);
    setBuildSettings((prev) => ({ ...prev, prompt: topic }));

    appendModelMessage('Reading the project skills before drafting the outline.');
    setActivity('read-project-skills', 'Read projects.md', 'running', 'Checking the project-based course pattern');
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    setActivity('read-project-skills', 'Read projects.md', 'complete', 'Project-based course pattern is ready');
    appendModelMessage(`Good. Now let me draft the outline${sizeLabel ? ` - ${sizeLabel.toLowerCase()}` : ''}, using the selected learner setup and course guidance.`);

    const localSources = await searchLocalPack(topic);
    if (researchEnabled) await runResearch(topic, localSources);
    else await draftOutline(topic, localSources);
  }

  const searchLocalPack = async (topic: string): Promise<ResearchResult[]> => {
    if (!localPackEnabled || !hasPythonApi()) return [];
    setActivity('local-knowledge-search', 'Search local course pack', 'running', 'Looking through controlled local files before web research');
    try {
      const results = await searchCourseKnowledge(topic, { workspaceId: conversationKey, courseId, includeLocal: true, includeCanonical: true });
      setActivity('local-knowledge-search', 'Searched local course pack', 'complete', `${results.length} local or canonical source${results.length === 1 ? '' : 's'} found`);
      return results;
    } catch (localError) {
      setActivity('local-knowledge-search', 'Local course-pack search unavailable', 'failed', (localError as Error).message);
      return [];
    }
  };

  const runResearch = async (topic: string, initialSources: ResearchResult[] = []) => {
    let plan = makeResearchSteps(topic);
    setSteps(plan);
    setSources([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(`afrograd-course-factory-sources:${conversationKey}`);
    }
    setStatuses((prev) => ({ ...prev, research: 'running' }));
    activateArtifact('research');
    setError(null);
    let gathered: ResearchResult[] = [];
    try {
      try {
        const generationPrompt = `We are researching the topic "${topic}" to draft an outline for a "${buildSettings.learnerLevel}" course aimed at "${buildSettings.audience}".
Generate 4 highly specific web search queries to gather reference materials for "${topic}".
Return strict JSON:
{
  "queries": [
    {"id": "scope", "label": "Identify core concepts & definitions for ${topic}", "query": "${topic} core concepts definition frameworks"},
    {"id": "curricula", "label": "Review educational curriculum & benchmarks for ${topic}", "query": "${topic} university syllabus course curriculum"},
    {"id": "pedagogy", "label": "Research common misconceptions & teaching approaches for ${topic}", "query": "${topic} teaching guide common mistakes practical skills"},
    {"id": "applications", "label": "Find practical case studies & African contexts for ${topic}", "query": "${topic} case study projects African ecosystem emerging markets"}
  ]
}`;
        const res = await callAIService({ prompt: generationPrompt, systemInstruction: "You are Zara, Afrograd Academy's course researcher. Generate a custom web research plan for the given topic in strict JSON format." });
        const parsed = extractJson(res).queries;
        if (Array.isArray(parsed) && parsed.length === 4) {
          plan = [
            ...parsed.map((item: { id?: string; label?: string; query?: string }) => ({
              id: item.id || 'scope',
              label: item.label || 'Search step',
              query: item.query || topic,
              status: 'pending' as const
            })),
            { id: 'save', label: 'Rank sources and save research notes', query: '', status: 'pending' as const },
            { id: 'outline', label: 'Draft outline with per-topic guidance', query: '', status: 'pending' as const }
          ];
          setSteps(plan);
        }
      } catch (genErr) {
        console.warn('Failed to generate dynamic search queries, falling back to templates:', genErr);
      }
      for (const step of plan.slice(0, 4)) {
        updateStep(step.id, 'running');
        setActivity(`research-${step.id}`, step.label, 'running');
        setLiveStatus(step.id === 'scope' ? 'Searching the web…' : step.label);
        const { results, engines } = await searchCourseResearchDetailed(step.query);
        gathered = dedupeSources([...gathered, ...results]).slice(0, 24);
        setSources(gathered);
        updateStep(step.id, 'complete');
        const engineSummary = formatEngineSummary(engines);
        setActivity(
          `research-${step.id}`,
          step.label,
          'complete',
          `${results.length} new source${results.length === 1 ? '' : 's'} found${engineSummary ? ` (${engineSummary})` : ''}`,
        );
      }
      // Deep read: pull the full text of the best non-video sources so lessons
      // are grounded in real page content, not 200-character snippets.
      const deepReadUrls = pickDeepReadUrls(gathered);
      if (deepReadUrls.length) {
        setActivity('research-deep-read', 'Reading top sources in full', 'running', `${deepReadUrls.length} pages`);
        setLiveStatus('Reading the strongest sources in full…');
        try {
          gathered = await deepReadSources(gathered, deepReadUrls);
          setSources(gathered);
          const readCount = gathered.filter((source) => source.content).length;
          setActivity('research-deep-read', 'Read top sources in full', 'complete', `${readCount} of ${deepReadUrls.length} pages extracted`);
        } catch {
          setActivity('research-deep-read', 'Deep read unavailable', 'failed', 'Continuing with search snippets only.');
        }
      }
      updateStep('save', 'running');
      setActivity('research-save', 'Ranking and saving research sources', 'running', `${gathered.length} candidate sources`);
      setLiveStatus(`Ranking ${gathered.length} sources…`);
      gathered = gathered.filter((source) => source.title && source.url && source.snippet);
      setSources(gathered);
      updateStep('save', 'complete');
      setActivity('research-save', 'Saved research sources', 'complete', `${gathered.length} qualified sources`);
      setStatuses((prev) => ({ ...prev, research: 'ready', outline: 'running' }));
      updateStep('outline', 'running');
      await draftOutline(topic, gathered);
    } catch (researchError) {
      setActivity('research-failed', 'Research paused', 'failed', (researchError as Error).message);
      setStatuses((prev) => ({ ...prev, research: 'failed' }));
      setSteps((prev) => prev.map((step) => step.status === 'running' ? { ...step, status: 'failed' } : step));
      setError((researchError as Error).message);
      setLiveStatus('Research paused. Completed sources have been preserved.');
    }
  };

  const composerContext = createCourseSurfaceContext({
    surface,
    workspaceId: conversationKey,
    courseId,
    buildJobId: activeBuildJobId,
    generationJobId: currentDraft?.generationJobId,
    selectedArtifactId: selectedArtifact?.id || null,
    version: typeof selectedArtifact?.version === 'string' || typeof selectedArtifact?.version === 'number' ? selectedArtifact.version : null,
  });
  const contextArtifactId = composerContext.artifactId;
  const contextVersion = composerContext.version;
  const contextLabel = surface === 'chat'
    ? 'Course brief'
    : surface === 'outline'
      ? selectedContext
      : ({ research: 'Research sources', build: 'Build artifacts', review: 'Review findings', artifacts: 'Saved artifacts' } as Record<string, string>)[surface] || surface;
  const contextPrefix = surface === 'chat'
    ? ''
    : `[Feedback on ${contextLabel} | surface=${surface} | artifactId=${contextArtifactId}${contextVersion == null ? '' : ` | version=${contextVersion}`}]`;

  const send = async (override?: string) => {
    const text = (override || input).trim();
    if ((!text && attachments.length === 0) || isResponding) return;
    const fallbackText = text || 'Please review the attached course material and help me turn it into a course.';
    setInput('');
    const attachmentContext = buildAttachmentContext();
    const displayText = `${contextPrefix ? `${contextPrefix} ` : ''}${fallbackText}${attachments.length ? `\n\nAttached:\n${attachments.map((file) => `${fileKindLabels[file.fileKind]}: ${file.name}`).join('\n')}` : ''}`;
    const userMessage: ChatMessage = { role: 'user', content: displayText, timestamp: new Date().toISOString() };
    setAttachments([]);

    // 1. Initial Prompt / Zero-State: User defines the course topic
    const isFirstTopic = !brief || messages.length === 0;
    if (surface === 'chat' && isFirstTopic) {
      setBrief(fallbackText);
      setBuildSettings((prev) => ({ ...prev, prompt: fallbackText }));
      setSources([]);
      onDraftReady(null, null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(`afrograd-course-factory-sources:${conversationKey}`);
        window.localStorage.removeItem(`afrograd-course-factory-currentDraft:${conversationKey}`);
      }
      setStatuses({ chat: 'ready', research: 'hidden', outline: 'hidden', build: 'hidden', review: 'hidden', artifacts: 'hidden' });
      updateSetupAnswers({
        source: attachments.length > 0 ? 'uploaded_materials' : 'topic_prompt',
      });
      setPendingQuestion('audience');
      const zaraGreeting: ChatMessage = {
        role: 'model',
        content: `I'd love to help you build **${fallbackText}**! 🎓\n\nTo tailor the curriculum and depth, let's configure a few quick details:\n\n**Step 1:** Who is the target audience for this course? (Select an option below or type your answer)`,
        timestamp: new Date(Date.now() + 50).toISOString(),
      };
      setMessages((prev) => [...prev, userMessage, zaraGreeting]);
      return;
    }

    // 2. Multi-turn setup wizard questions in chat
    const currentQuestion = pendingQuestion || getNextQuestion(setupAnswers);
    if (surface === 'chat' && currentQuestion) {
      if (currentQuestion === 'source') {
        updateSetupAnswers({ source: attachments.length > 0 ? 'uploaded_materials' : 'topic_prompt' });
        setPendingQuestion('audience');
        const zaraMsg: ChatMessage = {
          role: 'model',
          content: `Source set to **${fallbackText}**.\n\n**Step 1:** Who is the target audience for this course? (Select an option below or type your answer)`,
          timestamp: new Date(Date.now() + 50).toISOString(),
        };
        setMessages((prev) => [...prev, userMessage, zaraMsg]);
        return;
      }

      if (currentQuestion === 'audience') {
        updateSetupAnswers({ audience: fallbackText });
        setBuildSettings((prev) => ({ ...prev, audience: fallbackText }));
        setPendingQuestion('starting_level');
        const zaraMsg: ChatMessage = {
          role: 'model',
          content: `Designing this course for **${fallbackText}**.\n\n**Step 2:** Where are learners starting from? (Select their background level below)`,
          timestamp: new Date(Date.now() + 50).toISOString(),
        };
        setMessages((prev) => [...prev, userMessage, zaraMsg]);
        return;
      }

      if (currentQuestion === 'starting_level') {
        const learnerLevel = fallbackText.toLowerCase().includes('adv') ? 'Advanced' : fallbackText.toLowerCase().includes('inter') ? 'Intermediate' : 'Beginner';
        updateSetupAnswers({ startingLevel: fallbackText });
        setBuildSettings((prev) => ({ ...prev, learnerLevel }));
        setPendingQuestion('course_feel');
        const zaraMsg: ChatMessage = {
          role: 'model',
          content: `Understood — **${fallbackText}** level.\n\n**Step 3:** How should the course feel? (Select a learning style below)`,
          timestamp: new Date(Date.now() + 50).toISOString(),
        };
        setMessages((prev) => [...prev, userMessage, zaraMsg]);
        return;
      }

      if (currentQuestion === 'course_feel') {
        updateSetupAnswers({ courseFeel: fallbackText });
        setPendingQuestion('course_size');
        const zaraMsg: ChatMessage = {
          role: 'model',
          content: `Selected **${fallbackText}** structure.\n\n**Step 4:** How big should this course be? (Select the number of units below)`,
          timestamp: new Date(Date.now() + 50).toISOString(),
        };
        setMessages((prev) => [...prev, userMessage, zaraMsg]);
        return;
      }

      if (currentQuestion === 'course_size') {
        const units = fallbackText.includes('2') || fallbackText.toLowerCase().includes('mini') ? 2 : fallbackText.includes('6') || fallbackText.toLowerCase().includes('comprehensive') ? 6 : 4;
        const courseSize: CourseBuildSettings['courseSize'] = units === 2 ? 'short' : units === 6 ? 'deep' : 'medium';
        updateSetupAnswers({ courseSize: fallbackText });
        setBuildSettings((prev) => ({ ...prev, courseSize, unitCount: units, lessonsPerUnit: 2 }));
        setPendingQuestion(null);
        const zaraMsg: ChatMessage = {
          role: 'model',
          content: `All set! Sizing configured for **${fallbackText}** (${units} units). Generating your tailored outline now!`,
          timestamp: new Date(Date.now() + 50).toISOString(),
        };
        setMessages((prev) => [...prev, userMessage, zaraMsg]);
        void beginCourseDraftFromSetup(fallbackText);
        return;
      }
    }

    // 3. Normal conversation with unified chat turn
    const nextMessages = [...messages, userMessage];
    const contextualText = `${contextPrefix ? `${contextPrefix} ` : ''}${fallbackText}\n\n${setupContext()}${attachmentContext ? `\n\nAttached course material:\n${attachmentContext}` : ''}`;
    const modelMessages = [...messages, { ...userMessage, content: contextualText }];
    setIsResponding(true);

    const setupIsComplete = !getNextQuestion(setupAnswers);
    if (surface === 'chat' && setupIsComplete && !currentDraft) {
      const topic = brief.trim() || fallbackText;
      setMessages([...nextMessages, {
        role: 'model',
        content: 'Thanks! I have the course brief and learner setup. I’m drafting the outline now; the Outline tab will open as soon as it is ready.',
        timestamp: new Date().toISOString(),
      }]);
      try {
        const localSources = await searchLocalPack(topic);
        if (researchEnabled) await runResearch(topic, localSources);
        else await draftOutline(topic, localSources);
      } catch (sendError) {
        setError((sendError as Error).message);
      } finally {
        setIsResponding(false);
      }
      return;
    }

    setMessages([...nextMessages, { role: 'model', content: '', timestamp: new Date().toISOString() }]);
    try {
      const result = await runUnifiedChatTurn({
        conversationId: chatConversationId,
        message: modelMessages[modelMessages.length - 1],
        history: modelMessages.slice(0, -1),
        activeAgentId: 'learning',
        surface: 'course_builder',
        responseMode: 'structured',
        courseId: courseId || undefined,
        workspaceId: conversationKey,
        retrievalScope: { workspaceId: conversationKey, courseId, includeLocal: localPackEnabled, includeCanonical: true },
        systemInstruction: assistantInstruction,
        agentInstructions: {
          career: assistantInstruction,
          learning: assistantInstruction,
          startup: assistantInstruction,
          academic: assistantInstruction,
          memory: assistantInstruction,
          job_creator: assistantInstruction,
          event_planner: assistantInstruction,
        } as Record<AgentId, string>,
        onEvent: (event: ChatEvent) => {
          if (event.type !== 'message_delta') return;
          setMessages((prev) => {
            const copy = [...prev];
            const existing = copy[copy.length - 1]?.content || '';
            // The hand-off marker arrives a few characters at a time; hide it,
            // and any partial of it, instead of flashing "[[READY_FOR" at the creator.
            const content = stripReadyMarker(event.content.startsWith(existing) ? event.content : `${existing}${event.content}`);
            copy[copy.length - 1] = { role: 'model', content, timestamp: new Date().toISOString() };
            return copy;
          });
        },
      });
      setChatConversationId(result.conversationId);
      const response = result.response;
      const readyForOutline = response.includes('[[READY_FOR_OUTLINE]]');
      const displayResponse = response.replace('[[READY_FOR_OUTLINE]]', '').trim();
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'model', content: displayResponse, timestamp: new Date().toISOString() };
        return copy;
      });
      if (surface === 'outline' && currentDraft) await draftOutline(`${brief}\n\nRevision request: ${text}`);
      else if (surface === 'chat' && readyForOutline) {
        const topic = brief || fallbackText;
        const localSources = await searchLocalPack(topic);
        if (researchEnabled) await runResearch(topic, localSources);
        else await draftOutline(topic, localSources);
      }
    } catch (sendError) {
      setError((sendError as Error).message);
    } finally {
      setIsResponding(false);
    }
  };

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files).slice(0, 6);
    selectedFiles.forEach((file, index) => setActivity(`file-${file.name}-${index}`, `Reading ${file.name}`, 'running'));
    const next = await Promise.all(selectedFiles.map(async (file, index) => {
      const readable = /^(text\/|application\/(json|csv))/.test(file.type) || /\.(txt|md|csv|json)$/i.test(file.name);
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const isDocx = /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i.test(file.type) || /\.docx$/i.test(file.name);
      const attachment: CourseAttachment = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        fileKind: fileKindFromMime(file.type, file.name) === 'other' ? pendingFileKind : fileKindFromMime(file.type, file.name),
        extractionStatus: 'unsupported',
      };
      try {
        if (readable) {
          attachment.content = (await file.text()).slice(0, 16000);
          attachment.extractionStatus = 'extracted';
        } else if (isPdf) {
          attachment.content = await extractPdfText(file);
          attachment.extractionStatus = 'extracted';
        } else if (isDocx) {
          attachment.content = await extractDocxText(file);
          attachment.extractionStatus = 'extracted';
        }
        setActivity(`file-${file.name}-${index}`, attachment.extractionStatus === 'extracted' ? `Read ${file.name}` : `Attached ${file.name}`, 'complete', attachment.extractionStatus === 'extracted' ? 'Document text is ready for course planning' : `${fileKindLabels[pendingFileKind]} attached for course planning`);
      } catch (attachError) {
        attachment.content = `Text extraction failed for ${file.name}: ${(attachError as Error).message}`;
        attachment.extractionStatus = 'failed';
        setActivity(`file-${file.name}-${index}`, `Attachment extraction failed for ${file.name}`, 'failed', (attachError as Error).message);
      }
      return attachment;
    }));
    setAttachments((prev) => [...prev, ...next].slice(0, 6));
    updateSetupAnswers({ source: setupAnswers.source || 'uploaded_materials' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const attachLocalFolder = async (files: FileList | null) => {
    if (!files?.length || !hasPythonApi()) return;
    const selectedFiles = Array.from(files).slice(0, 40);
    setLocalPackStatus('indexing');
    setLocalPackMessage('Reading the selected course folder…');
    setLocalPackEnabled(true);
    try {
      const uploads: Array<{ relativePath: string; content: string; mimeType?: string }> = [];
      for (const [index, file] of selectedFiles.entries()) {
        const readable = /^(text\/|application\/(json|csv))/.test(file.type) || /\.(txt|md|csv|json|py|js|ts|tsx|jsx|html|xml|yaml|yml)$/i.test(file.name);
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isDocx = /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/i.test(file.type) || /\.docx$/i.test(file.name);
        if (!readable && !isPdf && !isDocx) continue;
        setActivity(`local-file-${file.name}-${index}`, `Indexing ${file.name}`, 'running');
        let content = '';
        if (readable) content = (await file.text()).slice(0, 1_800_000);
        else if (isPdf) content = await extractPdfText(file);
        else if (isDocx) content = await extractDocxText(file);
        if (!content.trim()) continue;
        uploads.push({
          relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
          content,
          mimeType: file.type || undefined,
        });
        setActivity(`local-file-${file.name}-${index}`, `Indexed ${file.name}`, 'complete', 'Ready for local retrieval');
      }
      if (!uploads.length) throw new Error('No supported text, PDF, or Word files were found in that folder.');
      const result = await uploadLocalKnowledge({ workspaceId: conversationKey, courseId, files: uploads });
      setLocalPackStatus('ready');
      setLocalPackMessage(`${result.manifestFiles} local file${result.manifestFiles === 1 ? '' : 's'} ready for Zara.`);
    } catch (localError) {
      setLocalPackStatus('error');
      setLocalPackMessage((localError as Error).message);
    } finally {
      if (localFolderInputRef.current) localFolderInputRef.current.value = '';
    }
  };

  const approveAndBuild = async () => {
    if (!currentDraft || isImporting) return;
    appendModelMessage(`Build started for **${currentDraft.course.title}**. Zara is generating actual content from the approved outline now.`);
    setStatuses((prev) => ({ ...prev, build: 'running' }));
    setBuildStarted(true);
    setLiveStatus('Starting agentic build flow…');
    activateArtifact('build');

    // Estimate total artifacts: 1 lesson, 1 flashcards, 1 quiz, 1 activity per
    // topic + 1 assessment per unit. The final-assessment lesson stub appended
    // to each module is NOT a topic — counting it inflated the denominator by
    // 4 per unit and the progress bar could never reach its true fraction.
    const totalCount = currentDraft.course.modules.length
      + currentDraft.course.modules.reduce((sum, module) => sum + module.lessons.filter((lesson) => !isAssessment(lesson.title)).length * 4, 0);
    setBuildTotalCount(totalCount);
    setArtifactProgress({});
    setBuildFeed([]);
    setAwaitingContinue(null);

    try {
      const settingsForBuild = {
        ...defaultSettings,
        ...buildSettings,
        prompt: buildSettings.prompt?.trim() || brief.trim() || currentDraft.course.title,
        generationGuidance: buildSettings.generationGuidance?.trim() || DEFAULT_GENERATION_GUIDANCE,
      };
      setBuildSettings(settingsForBuild);
      // The backends key everything (checkpoint, artifacts, events) off a real
      // course_build_jobs row. An invented UUID makes every job-scoped call
      // 404 — including the build_failed event — leaving the UI stuck on
      // 'running'. So if outlining never persisted a job, create one now.
      let jobId = activeBuildJobId;
      if (!jobId) {
        const createdJob = await db.createCourseBuildJob(settingsForBuild);
        jobId = createdJob?.id || crypto.randomUUID(); // UUID fallback still allows the local build path.
        onDraftReady({ ...currentDraft, generationJobId: jobId }, jobId);
      }

      const buildRes = await buildApprovedCourse(jobId, currentDraft, settingsForBuild);

      if (!buildRes || buildRes.status === 'local_fallback' || buildRes.status !== 'started') {
        void runLocalAgentBuild({
          jobId,
          draft: currentDraft,
          settings: settingsForBuild,
          callbacks: {
            setStatuses,
            setBuildStarted,
            setLiveStatus,
            activateArtifact,
            setBuildTotalCount,
            setArtifactProgress,
            setBuildFeed,
            setAwaitingContinue,
            onDraftReady,
            appendModelMessage,
          },
        });
        return;
      }

      await connectToBuildEvents(buildRes.jobId || jobId);
    } catch (err: unknown) {
      setStatuses((prev) => ({ ...prev, build: 'failed' }));
      setLiveStatus(`Failed to start build: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const approveOutline = () => {
    if (!currentDraft || isImporting) return;
    setBuildSettings((previous) => ({
      ...previous,
      prompt: previous.prompt?.trim() || brief.trim() || currentDraft.course.title,
      generationGuidance: previous.generationGuidance?.trim() || DEFAULT_GENERATION_GUIDANCE,
    }));
    setBuildStarted(false);
    setStatuses((previous) => ({ ...previous, outline: 'ready', build: 'ready' }));
    setLiveStatus('Outline approved. Review the generation prompt, then build the course.');
    appendModelMessage(`Outline approved for **${currentDraft.course.title}**. Review the generation prompt in **Build**, then choose **Build course** to generate the actual lessons and activities.`);
    activateArtifact('build');
  };

  const saveBuiltCourse = async () => {
    if (!currentDraft || isImporting) return;
    appendModelMessage(`Saving **${currentDraft.course.title}** to the course library.`);
    try {
      await onImportDraft(currentDraft);
      appendModelMessage(`**${currentDraft.course.title}** was saved to the course library. You can find it in Courses and continue editing it there.`);
    } catch (error) {
      appendModelMessage(`I could not save **${currentDraft.course.title}** to the course library: ${(error as Error).message}`);
    }
  };

  const visibleTabs = (['chat', 'research', 'outline', 'build', 'review', 'artifacts'] as Surface[]).filter((tab) => tab === 'chat' || statuses[tab] !== 'hidden');

  useEffect(() => {
    const scroller = tabScrollerRef.current;
    const tab = tabRefs.current[surface];
    if (!scroller || !tab) return;
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const inset = 8;
    const tabLeft = tab.offsetLeft;
    const tabRight = tabLeft + tab.offsetWidth;
    const visibleLeft = scroller.scrollLeft + inset;
    const visibleRight = scroller.scrollLeft + scroller.clientWidth - inset;
    const nextLeft = tabLeft < visibleLeft
      ? Math.max(0, tabLeft - inset)
      : tabRight > visibleRight
        ? Math.max(0, tabRight - scroller.clientWidth + inset)
        : null;
    if (nextLeft != null) scroller.scrollTo({ left: nextLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [surface, visibleTabs.length]);

  useEffect(() => {
    if (!buildSidebarOpen && !(chatOpen && surface !== 'chat')) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (buildSidebarOpen) setBuildSidebarOpen(false);
      else setChatOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [buildSidebarOpen, chatOpen, surface, setBuildSidebarOpen]);

  const handleNewChat = () => {
    if (typeof window !== 'undefined') {
      const suffix = `:${conversationKey}`;
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('afrograd-course-factory-') && key.endsWith(suffix)) {
          window.localStorage.removeItem(key);
        }
      }
    }
    setMessages(initialMessages());
    setInput('');
    setBrief(defaultSettings.prompt || '');
    setBuildSettings(defaultSettings);
    setResearchEnabled(false);
    setSources([]);
    setSteps([]);
    setOutlineStreamSteps([]);
    setSetupAnswers({});
    setPendingQuestion('source');
    setActivities([]);
    setBuildStarted(false);
    setStatuses({ chat: 'ready', research: 'hidden', outline: 'hidden', build: 'hidden', review: 'hidden', artifacts: 'hidden' });
    // Clear the parent-owned draft too. Leaving it set deadlocks the next
    // outline: beginCourseDraftFromSetup and the deterministic outline branch
    // in send() both early-return while a currentDraft exists.
    onDraftReady(null, null);
    setSurface('chat');
    setChatOpen(true);
    setAttachments([]);
    setError(null);
    setLiveStatus('');
    setArtifactProgress({});
    setBuildFeed([]);
    setAwaitingContinue(null);
    setBuildTotalCount(0);
    setSelectedArtifact(null);
  };

  const renderChatTimeline = () => chatTimeline.map((item) => {
    // Skip empty streaming placeholder bubbles — the thinking bar handles the loading state
    if (item.kind === 'message' && item.message.role === 'model' && !item.message.content) return null;
    if (item.kind === 'activity') return (
      <div key={item.id} className="editor-activity-row max-w-3xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${item.activity.status === 'complete' ? 'bg-green-50 text-green-700' : item.activity.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-500'}`}>
            {item.activity.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.activity.status === 'complete' ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0"><span className="block text-xs font-bold text-slate-700">{item.activity.label}</span>{item.activity.detail && <span className="mt-0.5 block text-[11px] leading-4 text-slate-400 font-semibold">{item.activity.detail}</span>}</span>
        </div>
      </div>
    );
    return (
      <div key={item.id} className={`flex w-full ${item.message.role === 'user' ? 'justify-end pr-3' : 'justify-start pl-1'}`}>
        {item.message.role === 'user' ? (
          <div className="max-w-[75%]">
            <div className="bg-filled text-white text-xs sm:text-sm leading-relaxed px-4 py-2.5 rounded-[2px] shadow-2xs">
              {item.message.content}
            </div>
          </div>
        ) : (
          <div className="flex gap-4 max-w-[90%] w-full">
            <div className="relative shrink-0">
              <img
                src="/avatars/zara.webp"
                alt="Zara"
                className="mt-0.5 h-8 w-8 rounded-[2px] border border-slate-200 object-cover shadow-2xs premium-pulse-learning"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="bg-surface border border-slate-200 text-slate-800 rounded-[2px] shadow-2xs px-4 py-3 relative">
                <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed font-normal [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:mb-3 [&_h1]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:mb-3 [&_p]:last:mb-0 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:space-y-1 [&_li]:leading-relaxed [&_strong]:font-semibold [&_strong]:text-slate-900 [&_em]:italic [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_code]:text-slate-800 [&_pre]:bg-slate-100 [&_pre]:rounded-xl [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_blockquote]:italic [&_hr]:border-slate-200 [&_hr]:my-4 [&_a]:text-brand-600 [&_a]:underline">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {normalizeMathDelimiters(item.message.content)}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  });

  // The live Zara transcript uses the same message/activity primitives as the
  // Coach. Structured workflow surfaces remain outside the transcript, while
  // Markdown, source provenance, and actions stay in the shared message shell.
  const renderSharedChatTimeline = () => {
    const latestModelId = [...chatTimeline].reverse().find((item) => item.kind === 'message' && item.message.role === 'model')?.id;
    return chatTimeline.map((item) => {
      if (item.kind === 'activity') {
        return <AiActivityList key={item.id} items={[toAiActivityItem(item.activity)]} compact className="editor-activity-row max-w-3xl border border-slate-200 bg-slate-50/70 px-4 py-3 rounded-[2px]" />;
      }
      if (item.message.role === 'model' && !item.message.content) return null;
      const isUser = item.message.role === 'user';
      const messageSources = !isUser ? toAiSourceViews(sources) : [];
      const citationMarkers = !isUser ? extractCitationMarkers(item.message.content) : [];
      const citationText = stripCitationMarkers(item.message.content);
      return <div key={item.id} className={`flex w-full ${isUser ? 'justify-end pr-3' : 'justify-start pl-1'}`}>
        <AiMessage
          role={isUser ? 'user' : 'assistant'}
          avatar={!isUser ? <img src="/avatars/zara.webp" alt="Zara" className="h-8 w-8 rounded-[2px] border border-slate-200 object-cover shadow-2xs premium-pulse-learning" /> : undefined}
          content={isUser ? item.message.content : <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed font-normal"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMathDelimiters(citationText)}</ReactMarkdown></div>}
          actions={!isUser ? [{ id: 'copy', label: copiedCourseMessageId === item.id ? 'Copied' : 'Copy' }] : []}
          onAction={(action) => { if (action.id === 'copy') void navigator.clipboard?.writeText(item.message.content).then(() => { setCopiedCourseMessageId(item.id); window.setTimeout(() => setCopiedCourseMessageId(null), 1600); }); }}
          sources={!isUser && item.id === latestModelId ? messageSources : []}
          children={!isUser && citationMarkers.length ? <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{citationMarkers.map((marker) => <AiInlineCitation key={marker} marker={marker} sources={messageSources} />)}</div> : undefined}
          contentClassName="whitespace-normal"
          bubbleClassName={isUser ? 'bg-filled text-white border-transparent rounded-[2px]' : 'bg-surface border border-slate-200 text-slate-800 rounded-[2px] shadow-2xs px-4 py-3'}
          className={isUser ? 'max-w-[75%]' : 'max-w-[90%] w-full'}
          timestamp={item.message.timestamp}
        />
      </div>;
    });
  };

  const courseActivitySummary = <AiReasoningSummary items={activities.map(toAiActivityItem)} current={isResponding ? 'Zara is working' : liveStatus || undefined} running={isResponding} className="mx-auto mb-2 w-full max-w-3xl" />;

  const downloadArtifactFile = (art: CourseArtifact) => {
    const isObj = typeof art.content === 'object';
    const text = isObj ? JSON.stringify(art.content, null, 2) : String(art.content);
    const blob = new Blob([text], { type: isObj ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = art.artifactType;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`course-editor-workspace relative flex ${fitViewport ? 'course-editor-workspace--fit-viewport' : 'h-[calc(100dvh-112px)] min-h-[640px]'} flex-row gap-3`}>
      <section className="relative flex-1 min-w-0 flex flex-col border border-slate-200 bg-surface overflow-hidden text-secondary-900 rounded-[2px] shadow-2xs">
      <header className="course-editor-agent-header shrink-0 flex items-center justify-between border-b border-slate-200 bg-surface px-4 sm:px-6 h-13 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleBuildSidebar}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[2px] border border-slate-200 text-slate-600 transition-colors hover:border-secondary-900 hover:bg-slate-50 hover:text-secondary-900"
            aria-label="Open course workspace menu"
            aria-expanded={buildSidebarOpen}
          >
            <Menu className="h-4 w-4" />
          </button>
          <AiPersona agent={afrogradAgentCatalog.find((agent) => agent.id === 'learning') || afrogradAgentCatalog[0]} state={isResponding ? 'responding' : isDrafting ? 'thinking' : 'idle'} compact />

          {visibleTabs.length > 1 && (
            <div ref={tabScrollerRef} className="ml-2 flex items-center gap-1 border-l border-slate-200 pl-3 overflow-x-auto custom-scrollbar">
              {visibleTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  ref={(node) => { tabRefs.current[tab] = node; }}
                  onClick={() => {
                    if (tab === 'chat') {
                      setSurface('chat');
                      setChatOpen(true);
                      return;
                    }
                    activateArtifact(tab);
                  }}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-[2px] px-2.5 text-xs font-semibold capitalize transition-colors ${
                    surface === tab && (tab !== 'chat' || chatOpen)
                      ? 'bg-filled text-white shadow-2xs'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {tab === 'artifacts' ? 'Artifacts' : tab}
                  <StatusIcon status={statuses[tab]} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 shrink-0">
          <button
            type="button"
            onClick={() => { handleNewChat(); onStartNewBuild?.(); }}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[2px] border border-orange-200 bg-orange-50 px-2.5 text-xs font-semibold text-secondary-900 hover:bg-orange-100 transition-colors shadow-2xs"
            title="Start a fresh course from scratch"
          >
            <SquarePen className="h-3.5 w-3.5 text-brand-500" />
            <span>New course</span>
          </button>
          {brief && <span className="hidden max-w-56 truncate md:block text-slate-700 font-sans">{brief}</span>}
          <span className={`hidden items-center gap-1.5 rounded-[2px] px-2 py-0.5 sm:inline-flex ${draftSaveState === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : draftSaveState === 'saving' || draftSaveState === 'loading' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`} title={lastSavedAt ? `Last saved ${new Date(lastSavedAt).toLocaleString()}` : undefined}>
            <span className={`h-1.5 w-1.5 rounded-none ${draftSaveState === 'error' ? 'bg-red-500' : draftSaveState === 'saving' || draftSaveState === 'loading' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
            {draftSaveState === 'loading' ? 'Restoring…' : draftSaveState === 'saving' ? 'Saving…' : draftSaveState === 'error' ? 'Local copy only' : 'Saved'}
          </span>
          {surface !== 'chat' && <button type="button" onClick={() => setChatOpen((open) => !open)} className="inline-flex min-h-8 items-center gap-1.5 rounded-[2px] border border-slate-200 bg-surface px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-secondary-900" aria-expanded={chatOpen} aria-controls="course-editor-assistant">
            <PanelRight className="h-3.5 w-3.5 text-brand-500" />{chatOpen ? 'Hide assistant' : 'Open assistant'}
          </button>}
          {chatOpen && surface !== 'chat' && <button type="button" onClick={() => setChatOpen(false)} className="grid h-8 w-8 place-items-center rounded-[2px] hover:bg-slate-100 text-slate-500 hover:text-slate-800" aria-label="Collapse chat"><X className="h-4 w-4" /></button>}
        </div>
      </header>
      {buildSidebarOpen && (
        <div className="absolute inset-0 z-[55] flex bg-black/40 backdrop-blur-xs" role="presentation">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close course workspace menu" onClick={() => setBuildSidebarOpen(false)} />
          <aside className="relative z-10 flex h-full w-full max-w-sm flex-col border-r border-slate-200 bg-surface shadow-2xl text-secondary-900" role="dialog" aria-modal="true" aria-label="Course workspace menu">
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Course workspace</p><h2 className="mt-1 font-editorial text-lg font-bold text-secondary-900">Menu</h2></div>
              <button type="button" onClick={() => setBuildSidebarOpen(false)} className="grid h-8 w-8 place-items-center rounded-[2px] text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label="Close course workspace menu"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              <button type="button" onClick={() => { handleNewChat(); onStartNewBuild?.(); setBuildSidebarOpen(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-[2px] border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-secondary-900 hover:bg-orange-100 transition-colors"><SquarePen className="h-4 w-4 text-brand-500" />Start a new course</button>
              <div className="mt-5 border-t border-slate-100 pt-4"><p className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Recent builds</p>
                {recentBuilds.length === 0 ? <div className="py-8 text-center text-slate-400"><History className="mx-auto mb-2 h-6 w-6 opacity-40 text-slate-400" /><p className="text-xs font-semibold">No recent course builds.</p></div> : <div className="mt-2 space-y-1">{recentBuilds.map((build) => <button key={build.id} type="button" onClick={() => { onSelectRecentBuild?.(build); setBuildSidebarOpen(false); }} className={`flex min-h-12 w-full items-start gap-2 rounded-[2px] border-l-2 p-2 text-left hover:bg-slate-50 transition-colors ${build.id === activeBuildId ? 'border-brand-500 bg-orange-50/70 text-secondary-900' : 'border-transparent text-slate-700'}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-[2px] bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">{build.title.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block line-clamp-2 text-xs font-semibold text-secondary-900">{build.title}</span>{build.status && <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">{build.status}</span>}</span></button>)}</div>}
              </div>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
        {surface === 'chat' && (
          <ChatSurface
            chatScrollRef={chatScrollRef}
            fileInputRef={fileInputRef}
            pendingFileKind={pendingFileKind}
            localFolderInputRef={localFolderInputRef}
            messageCount={messages.length}
            scrollKey={`${chatTimeline.length}-${chatTimeline.map((item) => item.kind === 'message' ? item.message.content.length : item.activity.status).join('-')}`}
            activitySummary={courseActivitySummary}
            renderChatTimeline={renderSharedChatTimeline}
            isResponding={isResponding}
            hasCurrentDraft={Boolean(currentDraft)}
            setupAnswers={setupAnswers}
            pendingQuestion={pendingQuestion}
            getNextQuestion={getNextQuestion}
            selectSourcePreset={selectSourcePreset}
            selectAudiencePreset={selectAudiencePreset}
            selectStartingLevel={selectStartingLevel}
            selectCourseFeel={selectCourseFeel}
            selectSizePreset={selectSizePreset}
            thinkingStep={thinkingStep}
            input={input}
            setInput={setInput}
            send={send}
            attachments={attachments}
            setAttachments={setAttachments}
            attachFiles={attachFiles}
            attachLocalFolder={attachLocalFolder}
            localPackEnabled={localPackEnabled}
            localPackStatus={localPackStatus}
            localPackMessage={localPackMessage}
            researchEnabled={researchEnabled}
            setResearchEnabled={setResearchEnabled}
            userName={userName}
          />
        )}

        {surface === 'research' && (
          <ResearchSurface
            liveStatus={liveStatus}
            steps={steps}
            completedSteps={completedSteps}
            sources={sources}
            researchStatus={statuses.research}
            error={error}
          />
        )}

        {surface === 'outline' && (
          <OutlineSurface
            isDrafting={isDrafting}
            currentDraft={currentDraft}
            liveStatus={liveStatus}
            outlineStreamSteps={outlineStreamSteps}
            topicCount={topicCount}
            projectCount={projectCount}
            isImporting={isImporting}
            approveOutline={approveOutline}
            setSelectedContext={setSelectedContext}
          />
        )}

        {surface === 'build' && (
          <BuildSurface
            currentDraft={currentDraft}
            liveStatus={liveStatus}
            buildStatus={statuses.build}
            buildStarted={buildStarted}
            isImporting={isImporting}
            saveBuiltCourse={saveBuiltCourse}
            approveAndBuild={approveAndBuild}
            buildSettings={buildSettings}
            setBuildSettings={setBuildSettings}
            buildCompletedCount={buildCompletedCount}
            buildTotalCount={buildTotalCount}
            awaitingContinue={awaitingContinue}
            setAwaitingContinue={setAwaitingContinue}
            continuing={continuing}
            setContinuing={setContinuing}
            activeBuildJobId={activeBuildJobId}
            buildFeed={buildFeed}
            artifactProgress={artifactProgress}
          />
        )}

        {surface === 'review' && (
          <ReviewSurface
            currentDraft={currentDraft}
            buildSettings={buildSettings}
            isImporting={isImporting}
            onDraftReady={onDraftReady}
            activeBuildJobId={activeBuildJobId}
            saveBuiltCourse={saveBuiltCourse}
            appendModelMessage={appendModelMessage}
          />
        )}

        {surface === 'artifacts' && (
          <ArtifactsSurface
            artifacts={artifacts}
            agentRuns={agentRuns}
            setSelectedArtifact={setSelectedArtifact}
            onBackToChat={() => setSurface('chat')}
          />
        )}
      </div>

      {surface !== 'chat' && !chatOpen && (
        <AiComposerShell
          value={input}
          onChange={setInput}
          onSubmit={send}
          context={{ surface, artifactId: contextArtifactId, version: contextVersion, label: contextLabel, placeholder: `Tell Zara what to change about this ${contextLabel.toLowerCase()}…`, submitLabel: 'Send feedback' }}
          disabled={isResponding}
          isGenerating={isResponding}
          allowAttachments
          onFilesSelected={attachFiles}
          attachments={toAiAttachmentViews(attachments, { source: 'course' })}
          onRemoveAttachment={(attachment) => { const index = attachments.findIndex((item, candidateIndex) => `${item.name}-${item.size}-${candidateIndex}` === attachment.id); if (index >= 0) setAttachments((prev) => prev.filter((_, candidateIndex) => candidateIndex !== index)); }}
          className="shrink-0"
        />
      )}
        </div>

        {surface !== 'chat' && chatOpen && (
          <div id="course-editor-assistant" className="absolute inset-0 z-[60] flex bg-black/40 backdrop-blur-xs xl:static xl:z-auto xl:flex xl:w-[400px] xl:shrink-0 xl:border-l xl:border-slate-200 xl:bg-surface" onMouseDown={() => setChatOpen(false)}>
            <aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-surface text-secondary-900 shadow-2xl xl:ml-0 xl:max-w-none xl:shadow-none" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="course-editor-assistant-title">
              <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-surface"><div><h2 id="course-editor-assistant-title" className="font-editorial text-base font-bold text-secondary-900">Course Editor Assistant</h2><p className="mt-1 text-xs text-slate-500">Feedback stays scoped to {contextLabel}.</p></div><div className="flex items-center gap-1"><button type="button" onClick={handleNewChat} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-secondary-900" title="Start a new chat (clears this conversation)"><SquarePen className="h-3.5 w-3.5 text-brand-500" />New chat</button><button type="button" onClick={() => setChatOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-800" aria-label="Close assistant"><X className="h-5 w-5" /></button></div></header>
              <div className="relative flex-1 min-h-0">
                <div ref={chatScrollRef} className="h-full space-y-5 overflow-y-auto p-5">{courseActivitySummary}{renderSharedChatTimeline()}</div>
                <AiScrollToLatest containerRef={chatScrollRef} autoScrollKey={`${chatTimeline.length}-${isResponding}`} className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2" />
              </div>
              <AiComposerShell
                value={input}
                onChange={setInput}
                onSubmit={send}
                context={{ surface, artifactId: contextArtifactId, version: contextVersion, label: contextLabel, placeholder: `Give feedback on ${contextLabel.toLowerCase()}…`, submitLabel: 'Send feedback' }}
                disabled={isResponding}
                isGenerating={isResponding}
                allowAttachments
                onFilesSelected={attachFiles}
                attachments={toAiAttachmentViews(attachments, { source: 'course' })}
                onRemoveAttachment={(attachment) => { const index = attachments.findIndex((item, candidateIndex) => `${item.name}-${item.size}-${candidateIndex}` === attachment.id); if (index >= 0) setAttachments((prev) => prev.filter((_, candidateIndex) => candidateIndex !== index)); }}
              />
            </aside>
          </div>
        )}

      </div>

      {selectedArtifact && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs duration-200" onMouseDown={() => setSelectedArtifact(null)}>
          <div className="relative w-full max-w-4xl max-h-[85vh] bg-surface rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden duration-200 text-secondary-900" onMouseDown={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-slate-50">
              <div>
                <h3 className="font-editorial text-base font-bold text-secondary-900">
                  {selectedArtifact.title || selectedArtifact.artifactType}
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">{selectedArtifact.artifactType}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadArtifactFile(selectedArtifact)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Raw
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedArtifact(null)}
                  className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-200 transition-colors text-slate-500 hover:text-slate-800"
                  aria-label="Close raw file preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Modal Body */}
            <div className="flex-1 min-h-0 p-6 overflow-hidden bg-slate-900 flex flex-col">
              <pre className="flex-1 overflow-auto bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono select-all custom-scrollbar leading-relaxed">
                {typeof selectedArtifact.content === 'object'
                  ? JSON.stringify(selectedArtifact.content, null, 2)
                  : String(selectedArtifact.content)}
              </pre>
            </div>
          </div>
        </div>
      )}
      </section>
    </div>
  );
};
