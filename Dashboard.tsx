import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserProfile, Job, Course } from '../types';
import type { AgentId } from '../services/agentCatalog';
import { db } from '../services/db';
import { supabase } from '../services/supabase';
import { CoursesList, BlogsList } from './SharedViews';
import { useDashboardData } from '../hooks/useDashboardData';
import type { TabType, ToastType } from './dashboard/types';
import { DashboardSidebar, ChatSessionPreview } from './dashboard/DashboardSidebar';
import { DashboardHeader, type StudioHeaderControls } from './dashboard/DashboardHeader';
import { DashboardDraftsDrawer, DraftItem, type DraftsDrawerTab } from './dashboard/DashboardDraftsDrawer';
import { useDrafts } from '../hooks/useDrafts';
import { DashboardKnowledgeView } from './dashboard/DashboardKnowledgeView';
import { DashboardStudioView } from './dashboard/DashboardStudioView';
import { ProfileTab } from './dashboard/ProfileTab';
import { JobsTab } from './dashboard/JobsTab';
import { NetworkTab, MemberConnectModal } from './dashboard/NetworkTab';
import {
  Briefcase,
  Sparkles,
  BookOpen,
  CheckCircle,
  XCircle,
  GraduationCap,
  FolderLock,
  Compass,
  Layers3,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

interface DashboardProps {
  user: UserProfile;
  onLogout: () => void;
}

const DEFAULT_DRAFTS: DraftItem[] = [
  {
    id: 'draft-1',
    title: 'Oxford MSc CS — Statement of Purpose v1',
    type: 'sop',
    content: `# Statement of Purpose: MSc in Computer Science (Artificial Intelligence)
University of Oxford

## 1. Academic Trajectory & Motivations
My journey into machine learning began at the intersection of resource-constrained computing and practical educational access. Across sub-Saharan Africa, students face acute connectivity bottlenecks...

## 2. Research Alignment
I am particularly drawn to the Oxford Applied Machine Learning group's research into small parameter models and on-device quantization...

## 3. Long-Term Vision
Following graduate studies, my commitment is to establish accessible educational pipelines that empower African engineers to build sovereign AI infrastructure.`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'draft-2',
    title: '4-Week AI Engineering Course Blueprint',
    type: 'course',
    content: `# 4-Week AI Engineering Sprint Syllabus

- **Unit 1: Prompt Architecture & Socratic Systems**
  - Lesson 1.1: System instructions and few-shot calibration
  - Lesson 1.2: Structured JSON outputs and tool calling

- **Unit 2: Embeddings & Context Retrieval**
  - Lesson 2.1: Local vector embeddings and similarity search
  - Lesson 2.2: Building robust retrieval augmented generation (RAG)

- **Unit 3: Evaluation & Benchmarking**
  - Lesson 3.1: LLM-as-a-judge evaluation frameworks
  - Lesson 3.2: Latency vs accuracy trade-offs`,
    createdAt: new Date().toISOString(),
  },
];

export const Dashboard: React.FC<DashboardProps> = ({ user: initialUser, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialRouteAgent = (location.state as { initialAgent?: AgentId } | null)?.initialAgent;

  // Active Tab: Defaults to AI Studio / Chat
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('afrograd_dashboard_active_tab') as TabType;
      const validTabs: TabType[] = ['ai-tools', 'studio', 'learning', 'course-creator', 'knowledge', 'jobs', 'profile'];
      if (saved && validTabs.includes(saved)) {
        return saved;
      }
    }
    return 'ai-tools';
  });

  useEffect(() => {
    localStorage.setItem('afrograd_dashboard_active_tab', activeTab);
  }, [activeTab]);

  // Sidebar compact preference
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('afrograd_dashboard_sidebar_minimized') === 'true';
  });

  const [user, setUser] = useState<UserProfile>(initialUser);
  const {
    members,
    jobs,
    courses,
    setCourses,
    blogs,
    profileTags,
    profileCourseStats,
    profileStudyStats,
  } = useDashboardData(user, setUser);

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // Session title, chat history, and "New chat" live in the single app header;
  // the mounted chat surface publishes them here. `setState` is referentially
  // stable, which is what `onHeaderControlsChange` requires.
  const [studioHeaderControls, setStudioHeaderControls] = useState<StudioHeaderControls | null>(null);
  /** Survives the studio unmounting so History is not empty on other tabs. */
  const [lastStudioSessions, setLastStudioSessions] = useState<ChatSessionPreview[]>([]);
  /** A session picked while the studio was unmounted, applied once it mounts. */
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  /**
   * Owned here, not in the drawer: as local state it reset to "drafts" whenever
   * the drawer remounted, so selecting History appeared to do nothing.
   */
  const [draftsTab, setDraftsTab] = useState<DraftsDrawerTab>('drafts');

  // Drafts Drawer State (Matching WriteWithSpiral right rail)
  // Shared with the admin panel, which runs the same Studio.
  const {
    drafts,
    activeDraft,
    setActiveDraft,
    saveDrafts,
    addDraft,
    deleteDraft: handleDeleteDraft,
    isDraftsOpen,
    setIsDraftsOpen,
    toggleDrafts,
  } = useDrafts(DEFAULT_DRAFTS);

  // Chatbot Agent
  useEffect(() => {
    if (!initialRouteAgent) return;
    setActiveTab('ai-tools');
    navigate(location.pathname, { replace: true, state: null });
  }, [initialRouteAgent, location.pathname, navigate]);

  // Networking
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null);
  const [learningTab, setLearningTab] = useState<'courses' | 'blogs'>('courses');

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleApplyJob = async (jobId: string) => {
    try {
      await db.applyForJob(jobId);
      setUser((prev) => ({ ...prev, appliedJobIds: [...(prev.appliedJobIds || []), jobId] }));
      showToast('Application submitted successfully!');
    } catch {
      showToast('Failed to apply.', 'error');
    }
  };

  const handleEnrollCourse = async (id: string) => {
    try {
      await db.enrollInCourse(id);
      setUser((prev) => ({ ...prev, enrolledCourseIds: [...(prev.enrolledCourseIds || []), id] }));
      showToast('Enrolled in course!');
    } catch {
      showToast('Failed to enroll.', 'error');
    }
  };

  const handleCreateCustomCourse = async (
    title: string,
    description: string,
    tasks: { title: string; duration: string }[],
  ) => {
    try {
      const courseId = `custom-${Date.now()}`;
      const courseSlug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

      const newCourse: Course = {
        id: courseId,
        title,
        provider: 'Zara (AI Architect)',
        level: 'Beginner',
        duration: 'Self-paced',
        category: 'AI/ML',
        image: '/images/generated/collaborative_study_in_a_sunlit_learning_space.png',
        description,
        slug: courseSlug,
        lessonCount: tasks.length,
        completedLessonCount: 0,
        modules: [
          {
            id: `${courseId}-m1`,
            courseId,
            title: 'Weekly Milestones',
            sortOrder: 1,
            lessons: tasks.map((task, idx) => ({
              id: `${courseId}-l${idx}`,
              moduleId: `${courseId}-m1`,
              title: `${task.title} (${task.duration})`,
              content: 'Self-guided practice and task checklist completion.',
              sortOrder: idx + 1,
              status: 'published',
              isCompleted: false,
            })),
          },
        ],
      };

      setCourses((prev) => [newCourse, ...prev]);
      setUser((prev) => ({
        ...prev,
        enrolledCourseIds: [...(prev.enrolledCourseIds || []), courseId],
      }));

      // Add to drafts drawer as well
      const syllabusMarkdown = `# ${title}\n\n${description}\n\n## Modules\n` +
        tasks.map((t, i) => `${i + 1}. **${t.title}** (${t.duration})`).join('\n');

      saveDrafts([
        {
          id: `course-draft-${Date.now()}`,
          title: `${title} Syllabus`,
          type: 'course',
          content: syllabusMarkdown,
          createdAt: new Date().toISOString(),
        },
        ...drafts,
      ]);

      showToast('Course created and added to your Learning Hub and Drafts!');
    } catch (err) {
      console.error(err);
      showToast('Failed to create custom course', 'error');
    }
  };

  const firstName = user.name ? user.name.split(' ')[0] : 'Afro';

  /**
   * The real Studio transcripts, republished by the studio through
   * `onHeaderControlsChange`. Both the left sidebar and the drafts drawer read
   * from here; they previously rendered a hardcoded fixture list, so History
   * showed four invented titles and clicking one could not restore anything.
   *
   * The studio publishes `null` when it unmounts, which is every tab that is
   * not the Studio. The last list is retained so History stays populated from
   * anywhere the drawer can be opened.
   */
  const studioSessions: ChatSessionPreview[] = studioHeaderControls?.sessions ?? lastStudioSessions;
  useEffect(() => {
    if (studioHeaderControls?.sessions) setLastStudioSessions(studioHeaderControls.sessions);
  }, [studioHeaderControls?.sessions]);

  /**
   * Selecting from another tab has no live studio to tell, so the id is held
   * until the studio mounts and republishes its controls.
   */
  useEffect(() => {
    if (!pendingSessionId || !studioHeaderControls) return;
    studioHeaderControls.onSelectSession(pendingSessionId);
    setPendingSessionId(null);
  }, [pendingSessionId, studioHeaderControls]);

  /** Opens a saved transcript in the Studio and gets the panels out of the way. */
  const openStudioSession = (sessionId: string) => {
    if (studioHeaderControls) studioHeaderControls.onSelectSession(sessionId);
    else setPendingSessionId(sessionId);
    setActiveTab('ai-tools');
    setIsDraftsOpen(false);
    setIsSidebarOpen(false);
  };

  return (
    <div className="ag-app fixed inset-0 overflow-hidden bg-canvas text-fg flex font-sans selection:bg-brand-100 selection:text-brand-800">
      {/* Toast Notification */}
      {toast && (
        <div
          role="alert"
          className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* ═══ Left Sidebar: WriteWithSpiral Layout ═══ */}
      <DashboardSidebar
        user={user}
        activeTab={activeTab}
        isSidebarCompact={isSidebarMinimized}
        isSidebarOpen={isSidebarOpen}
        onSelectTab={(id) => {
          setActiveTab(id);
          setIsSidebarOpen(false);
        }}
        onToggleCompact={() => {
          setIsSidebarMinimized((prev) => {
            localStorage.setItem('afrograd_dashboard_sidebar_minimized', String(!prev));
            return !prev;
          });
        }}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onNavigate={(path) => navigate(path)}
        onLogout={onLogout}
        sessions={studioSessions}
        activeSessionId={studioHeaderControls?.currentSessionId ?? null}
        onSelectSession={openStudioSession}
        onNewChat={() => {
          // Previously toasted "Started a fresh session" without starting one.
          studioHeaderControls?.onNewChat();
          setActiveTab('ai-tools');
          setIsSidebarOpen(false);
          showToast('Started a fresh session');
        }}
        draftsCount={drafts.length}
        onToggleDrafts={() => setIsDraftsOpen((prev) => !prev)}
      />

      {/* ═══ Main Content Canvas ═══ */}
      <div
        className={`flex-1 flex flex-col relative min-h-0 transition-all duration-200 overflow-hidden bg-canvas ${
          isSidebarMinimized ? 'md:ml-14' : 'md:ml-64'
        }`}
      >
        {/* Top Header */}
        <DashboardHeader
          user={user}
          activeTab={activeTab}
          onOpenSidebar={() => {
            if (window.innerWidth >= 768) {
              setIsSidebarMinimized((prev: boolean) => {
                const newVal = !prev;
                localStorage.setItem('afrograd_dashboard_sidebar_minimized', String(newVal));
                return newVal;
              });
            } else {
              setIsSidebarOpen(true);
            }
          }}
          onSelectTab={(id) => setActiveTab(id)}
          onNavigate={(path) => navigate(path)}
          onLogout={onLogout}
          draftsCount={drafts.length}
          onToggleDrafts={() => setIsDraftsOpen((prev) => !prev)}
          studio={studioHeaderControls}
        />

        {/* ═══ Workspace Views ═══ */}
        <main
          // `flex-1 min-h-0` on every branch: without min-h-0 a flex child
          // refuses to shrink below its content, so the shell grows and the
          // page scrolls instead of this region. Chat surfaces then hand
          // scrolling to their own message list; the rest scroll here.
          className={`relative flex flex-1 flex-col bg-canvas min-h-0 ${
            activeTab === 'ai-tools' || activeTab === 'studio' || activeTab === 'overview' || activeTab === 'course-creator'
              ? 'overflow-hidden'
              : 'overflow-y-auto custom-scrollbar'
          }`}
        >
          {/* Spacer to push content below the absolute header, allowing it to slide underneath when scrolling */}
          {activeTab !== 'ai-tools' && activeTab !== 'studio' && activeTab !== 'overview' && activeTab !== 'course-creator' && (
            <div className="h-14 shrink-0 w-full" aria-hidden="true" />
          )}
          {/* 1. STUDIO / AI FUTURE PLANNER (WriteWithSpiral Experience) */}
          {(activeTab === 'ai-tools' || activeTab === 'studio' || activeTab === 'overview') && (
            <DashboardStudioView
              user={user}
              jobs={jobs}
              courses={courses}
              drafts={drafts}
              onSaveDraft={addDraft}
              onToggleDrafts={toggleDrafts}
              activeDraft={activeDraft}
              onSelectDraft={setActiveDraft}
              onHeaderControlsChange={setStudioHeaderControls}
              hostRendersSessionBar
            />
          )}

          {/* 2. KNOWLEDGE VAULT (Matching Spiral Knowledge screen) */}
          {activeTab === 'knowledge' && (
            <DashboardKnowledgeView onBackToChat={() => setActiveTab('ai-tools')} />
          )}

          {/* 3. LEARNING HUB (Clean, no noisy banners) */}
          {activeTab === 'learning' && (
            <div className="p-6 sm:p-10 max-w-6xl mx-auto w-full">
              <div className="border-b border-slate-200 pb-6 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-secondary-900">
                    Learning Hub
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-600 font-reading mt-1">
                    Master artificial intelligence, engineering, and graduate pathways through practical sprints.
                  </p>
                </div>

                <div className="flex items-center gap-1 border border-slate-200 rounded-[2px] p-1 bg-surface shadow-2xs">
                  <button
                    onClick={() => setLearningTab('courses')}
                    className={`px-3 py-1.5 rounded-[2px] text-xs font-semibold transition-colors ${
                      learningTab === 'courses'
                        ? 'bg-filled text-white shadow-2xs'
                        : 'text-slate-500 hover:text-secondary-900'
                    }`}
                  >
                    Courses &amp; Sprints
                  </button>
                  <button
                    onClick={() => setLearningTab('blogs')}
                    className={`px-3 py-1.5 rounded-[2px] text-xs font-semibold transition-colors ${
                      learningTab === 'blogs'
                        ? 'bg-filled text-white shadow-2xs'
                        : 'text-slate-500 hover:text-secondary-900'
                    }`}
                  >
                    Field Notes
                  </button>
                </div>
              </div>

              {learningTab === 'courses' ? (
                <CoursesList
                  courses={courses}
                  onAction={handleEnrollCourse}
                  onViewDetails={(course) => navigate(`/learning/${course.id}`)}
                  user={user}
                  emptyAction={{ label: 'Build a course', onClick: () => setActiveTab('course-creator') }}
                />
              ) : (
                <BlogsList
                  blogs={blogs}
                  onViewDetails={(blog) => window.open(`/blog/${blog.id}`, '_blank')}
                  emptyAction={{ label: 'Browse courses', onClick: () => setLearningTab('courses') }}
                />
              )}
            </div>
          )}

          {/* 4. COURSE ARCHITECT (Zara Course Creator) */}
          {activeTab === 'course-creator' && (
            <DashboardStudioView
              user={user}
              jobs={jobs}
              courses={courses}
              drafts={drafts}
              onSaveDraft={addDraft}
              onToggleDrafts={toggleDrafts}
              activeDraft={activeDraft}
              onSelectDraft={setActiveDraft}
              mode="course"
              onHeaderControlsChange={setStudioHeaderControls}
              hostRendersSessionBar
            />
          )}

          {/* 5. OPPORTUNITIES & JOBS */}
          {activeTab === 'jobs' && (
            <div className="p-6 sm:p-10 max-w-4xl mx-auto w-full">
              <JobsTab
                user={user}
                jobs={jobs}
                onViewJob={(id) => navigate(`/jobs/${id}`)}
                onAskCareerCoach={() => {
                  setActiveTab('ai-tools');
                }}
              />
            </div>
          )}

          {/* 6. PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="p-6 sm:p-10 max-w-5xl mx-auto w-full">
              <ProfileTab
                user={user}
                setUser={setUser}
                profileTags={profileTags}
                profileCourseStats={profileCourseStats}
                profileStudyStats={profileStudyStats}
                showToast={showToast}
                onViewCourse={(courseId) => navigate(`/learning/${courseId}`)}
              />
            </div>
          )}

          {/* 7. NETWORK TAB */}
          {activeTab === 'network' && (
            <div className="p-6 sm:p-10 max-w-5xl mx-auto w-full">
              <NetworkTab
                user={user}
                members={members}
                onSelectMember={(member) => setSelectedMember(member)}
                onAskCoach={() => setActiveTab('ai-tools')}
              />
            </div>
          )}
        </main>
      </div>

      {/* ═══ Right-Hand Slide-Over Drafts Drawer (Matching WriteWithSpiral) ═══ */}
      <DashboardDraftsDrawer
        isOpen={isDraftsOpen}
        onClose={() => setIsDraftsOpen(false)}
        drafts={drafts}
        activeDraftId={activeDraft?.id}
        onDeleteDraft={handleDeleteDraft}
        onSelectDraft={(draft) => {
          setActiveDraft(draft);
          setActiveTab('ai-tools');
          setIsDraftsOpen(false);
        }}
        sessions={studioSessions}
        activeSessionId={studioHeaderControls?.currentSessionId ?? null}
        onSelectSession={openStudioSession}
        onDeleteSession={studioHeaderControls?.onDeleteSession}
        activeTab={draftsTab}
        onActiveTabChange={setDraftsTab}
      />

      {/* Member Connect Modal */}
      {selectedMember && (
        <MemberConnectModal
          user={user}
          setUser={setUser}
          selectedMember={selectedMember}
          onClose={() => setSelectedMember(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
};
