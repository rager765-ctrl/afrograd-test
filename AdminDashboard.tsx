import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  FileText,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  FilePlus2,
  Layers3,
  Library,
  Plus,
  Save,
  Trash2,
  Sliders,
  Users,
  Sparkles,
} from 'lucide-react';
import { Button } from './Button';
import { db } from '../services/db';
import { CourseBuilderWorkspaceV3 } from './CourseBuilderWorkspaceV3';
import { DashboardStudioView } from './dashboard/DashboardStudioView';
import { DashboardKnowledgeView } from './dashboard/DashboardKnowledgeView';
import { AgentId } from '../services/agentGraph';
import { ZaraCourseDraft } from '../services/courseBuilder';
import { buildScorm12Package } from '../services/scormExport';
import { ContentStatus, Course, CourseBuildJob, CourseLesson, CourseModule, CourseResource, CourseResourceStatus, CourseStatus, CourseVersion, Event as AppEvent, Job, JobApplication, LessonQuizAttempt, UserProfile } from '../types';
import {
  getCoursePublishIssues,
  getCourseReviewIssues,
} from '../services/coursePublishRules';
import {
  handleCourseImport as importCourseFromFileInput,
  handleDownloadScorm as downloadScormPackage,
  handleImportZaraDraft as importZaraDraft,
  handleTemplateDownload as downloadCourseTemplate,
} from '../services/courseImportExport';
import { useZaraBuilderSession } from '../hooks/useZaraBuilderSession';
import {
  arrayToInput,
  defaultZaraBuildSettings,
  emptyCourse,
  emptyEvent,
  emptyJob,
  inputToArray,
  type AdminTabEntry,
  type BuilderHistoryItem,
  type FlashMessage,
  type LibraryItem,
  type TabKey,
} from './admin/adminFormDefaults';
import { AdminLibrarySidebar } from './admin/AdminLibrarySidebar';
import { ThemeToggle } from './common/ThemeToggle';
import { SplashScreen } from './common/SplashScreen';
import { AdminUsersTab } from './admin/AdminUsersTab';
import { DashboardDraftsDrawer, type DraftsDrawerTab } from './dashboard/DashboardDraftsDrawer';
import type { StudioHeaderControls } from './dashboard/DashboardHeader';
import { useDrafts } from '../hooks/useDrafts';
import { AdminSettingsTab } from './admin/AdminSettingsTab';
import { AdminJobsTab } from './admin/AdminJobsTab';
import { AdminEventsTab } from './admin/AdminEventsTab';
import { AdminCourseTab } from './admin/AdminCourseTab';
import { AdminBlogsTab } from './admin/AdminBlogsTab';
import { blogStorage, type BlogPostItem } from '../services/blogStorage';
import { Newspaper } from 'lucide-react';
import logo from '../assets/afrograd-logo.png';

export interface AdminDashboardProps {
  currentUser?: UserProfile | null;
}

/**
 * Thin shell for the admin workspace. It owns the tab selection and navigation
 * chrome, the shared loading/saving/flash-message state, `loadAdminData`, the
 * content CRUD handlers, and the per-tab handler record the chrome is driven
 * by. Everything tab-specific lives in `components/admin/*` and
 * `hooks/useZaraBuilderSession.ts`.
 */
export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(currentUser || null);
  /*
   * The admin panel runs the same Studio as the learner dashboard but used to
   * hand it `drafts={[]}` and a no-op `onToggleDrafts`, so everything the
   * Studio produced here was unreachable: no drafts list, no drafts/history
   * drawer, and no way to reopen a draft on the live canvas. Same store as the
   * dashboard, so an admin's work follows them between the two surfaces.
   */
  const {
    drafts,
    activeDraft,
    setActiveDraft,
    addDraft,
    deleteDraft,
    isDraftsOpen,
    setIsDraftsOpen,
    toggleDrafts,
  } = useDrafts();
  const [studioHeaderControls, setStudioHeaderControls] = useState<StudioHeaderControls | null>(null);
  const [lastStudioSessions, setLastStudioSessions] = useState<StudioHeaderControls['sessions']>([]);
  const [draftsTab, setDraftsTab] = useState<DraftsDrawerTab>('drafts');
  useEffect(() => {
    if (studioHeaderControls?.sessions) setLastStudioSessions(studioHeaderControls.sessions);
  }, [studioHeaderControls?.sessions]);

  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'ai';
    try {
      const saved = window.localStorage.getItem('afrograd-admin-activeTab');
      return saved ? (saved as TabKey) : 'ai';
    } catch {
      return 'ai';
    }
  });
  const [message, setMessage] = useState<FlashMessage | null>(null);

  // Legacy client-side provider keys are purged on every tab change. This ran
  // as part of the AI-settings loader before that state moved into
  // `AdminSettingsTab`; keeping it here preserves the original schedule, since
  // the settings panel only mounts while its own tab is active.
  useEffect(() => {
    localStorage.removeItem('afrograd_openrouter_api_key');
    localStorage.removeItem('afrograd_groq_api_key');
  }, [activeTab]);

  const [blogs, setBlogs] = useState<BlogPostItem[]>(() => blogStorage.getAll());
  const [selectedBlogId, setSelectedBlogId] = useState<string | null>(null);

  const refreshBlogs = () => {
    setBlogs(blogStorage.getAll());
  };

  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseBuildJobs, setCourseBuildJobs] = useState<CourseBuildJob[]>([]);
  const [allMembers, setAllMembers] = useState<UserProfile[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [adminNavCollapsed, setAdminNavCollapsed] = useState(true);
  const [expandedAdminSections, setExpandedAdminSections] = useState<Partial<Record<TabKey, boolean>>>({});
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem('afrograd-admin-selectedCourseId');
    } catch {
      return null;
    }
  });
  const [courseResources, setCourseResources] = useState<CourseResource[]>([]);
  const [courseQuizAttempts, setCourseQuizAttempts] = useState<LessonQuizAttempt[]>([]);
  const [courseVersions, setCourseVersions] = useState<CourseVersion[]>([]);

  const [jobForm, setJobForm] = useState<Partial<Job>>(emptyJob());
  const [eventForm, setEventForm] = useState<Partial<AppEvent>>(emptyEvent());
  const [courseForm, setCourseForm] = useState<Partial<Course>>(emptyCourse());
  const [aiAgent, setAiAgent] = useState<AgentId>('career');

  const {
    zaraDraft,
    setZaraDraft,
    zaraJobId,
    setZaraJobId,
    zaraArtifacts,
    zaraRuns,
    zaraLaunchBrief,
    setZaraLaunchBrief,
    zaraLaunchToken,
    setZaraLaunchToken,
    zaraWorkspaceKey,
    zaraConversationKey,
    refreshZaraBuildArtifacts,
    openBuildInFactory,
    startNewFactoryBuild,
  } = useZaraBuilderSession({ courses, setActiveTab, setSelectedCourseId });

  const [scormLoading, setScormLoading] = useState(false);

  const [jobSkillsInput, setJobSkillsInput] = useState('');
  const [jobRequirementsInput, setJobRequirementsInput] = useState('');
  const [jobResponsibilitiesInput, setJobResponsibilitiesInput] = useState('');
  const [jobDeliverablesInput, setJobDeliverablesInput] = useState('');
  const [eventTagsInput, setEventTagsInput] = useState('');

  const [libraryOpen, setLibraryOpen] = useState(true);
  const [modulePanelOpen, setModulePanelOpen] = useState(true);
  const [moduleForm, setModuleForm] = useState<Partial<CourseModule>>({ title: '', description: '', sortOrder: 0 });
  const emptyLesson: Partial<CourseLesson> = {
    title: '',
    content: '',
    resourceUrl: '',
    videoUrl: '',
    imageUrls: [],
    attachments: [],
    estimatedMinutes: 15,
    sortOrder: 0,
    status: 'draft',
  };
  const [lessonForm, setLessonForm] = useState<Partial<CourseLesson>>(emptyLesson);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  const showMessage = (next: FlashMessage) => {
    setMessage(next);
    window.setTimeout(() => setMessage(null), 3500);
  };

  const loadAdminData = async () => {
    try {
      const [profile, nextJobs, nextEvents, nextCourses, nextMembers, nextBuildJobs] = await Promise.all([
        db.getCurrentProfile().catch(() => null),
        db.getAdminJobs().catch(() => []),
        db.getAdminEvents().catch(() => []),
        db.getAdminCourses().catch(() => []),
        db.getAdminMembers().catch(() => []),
        db.getCourseBuildJobs().catch(() => []),
      ]);

      if (profile) {
        setUser(profile);
      } else if (currentUser) {
        setUser(currentUser);
      }
      setJobs(nextJobs);
      setEvents(nextEvents);
      setCourses(nextCourses);
      setCourseBuildJobs(nextBuildJobs);
      setAllMembers(nextMembers);
    } catch (err) {
      console.error('Error loading admin workspace data:', err);
    }
  };

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      setLoading(true);
      try {
        await loadAdminData();
      } catch (err) {
        console.error('Error bootstrapping admin workspace:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const selectJob = (job: Job | null) => {
    setSelectedJobId(job?.id || null);
    setJobForm(job ? { ...job } : emptyJob());
    setJobSkillsInput(arrayToInput(job?.skills));
    setJobRequirementsInput(arrayToInput(job?.requirements));
    setJobResponsibilitiesInput(arrayToInput(job?.responsibilities));
    setJobDeliverablesInput(arrayToInput(job?.deliverables));
  };

  useEffect(() => {
    if (!selectedJobId) {
      setJobApplications([]);
      return;
    }

    db.getJobApplications(selectedJobId).then(setJobApplications);
  }, [selectedJobId]);

  useEffect(() => {
    if (!selectedCourseId) {
      setCourseResources([]);
      setCourseQuizAttempts([]);
      return;
    }
    Promise.all([db.getCourseResources(selectedCourseId), db.getCourseQuizAttempts(selectedCourseId)]).then(([resources, attempts]) => {
      setCourseResources(resources);
      setCourseQuizAttempts(attempts);
    });
  }, [selectedCourseId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('afrograd-admin-activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedCourseId) {
      window.localStorage.setItem('afrograd-admin-selectedCourseId', selectedCourseId);
    } else {
      window.localStorage.removeItem('afrograd-admin-selectedCourseId');
    }
  }, [selectedCourseId]);

  useEffect(() => {
    let cancelled = false;
    const loadVersions = async () => {
      if (!selectedCourseId) {
        setCourseVersions([]);
        return;
      }
      const versions = await db.getCourseVersions(selectedCourseId);
      if (!cancelled) setCourseVersions(versions);
    };
    void loadVersions();
    return () => { cancelled = true; };
  }, [selectedCourseId]);

  const selectEvent = (event: AppEvent | null) => {
    setSelectedEventId(event?.id || null);
    setEventForm(event ? { ...event } : emptyEvent());
    setEventTagsInput(arrayToInput(event?.tags));
  };

  const applyJobDraft = (data: Record<string, any>) => {
    const normalizedType = String(data.type || '').toLowerCase();
    const type: Job['type'] = normalizedType.startsWith('on') ? 'On-site' : normalizedType === 'hybrid' ? 'Hybrid' : 'Remote';
    const validCategories: Job['category'][] = ['Full-time', 'Internship', 'Contract', 'Gig', 'Project'];
    const category = validCategories.includes(data.category) ? data.category : 'Full-time';
    setSelectedJobId(null);
    setJobForm({
      ...emptyJob(),
      title: data.title || '',
      company: data.company || '',
      location: data.location || '',
      type,
      category,
      description: data.description || '',
      salaryRange: data.salaryRange || '',
      deadline: data.deadline || '',
      applyUrl: data.applyUrl || '',
    });
    setJobSkillsInput(arrayToInput(Array.isArray(data.skills) ? data.skills : []));
    setJobRequirementsInput(arrayToInput(Array.isArray(data.requirements) ? data.requirements : []));
    setJobResponsibilitiesInput(arrayToInput(Array.isArray(data.responsibilities) ? data.responsibilities : []));
    setJobDeliverablesInput('');
    setActiveTab('jobs');
    showMessage({ type: 'success', text: `Kwame drafted "${data.title || 'a job'}" — review it and publish.` });
  };

  const applyEventDraft = (data: Record<string, any>) => {
    const validTypes: AppEvent['type'][] = ['Hackathon', 'Webinar', 'Meetup', 'Conference'];
    setSelectedEventId(null);
    setEventForm({
      ...emptyEvent(),
      title: data.title || '',
      date: data.dateTime || data.date || '',
      location: data.location || data.link || 'Online',
      type: validTypes.includes(data.type) ? data.type : 'Webinar',
      organizer: data.organizer || data.speakerName || '',
      prize: data.prize || '',
    });
    setEventTagsInput(arrayToInput(Array.isArray(data.tags) && data.tags.length ? data.tags : data.category ? [data.category] : []));
    setActiveTab('events');
    showMessage({ type: 'success', text: `Efia drafted "${data.title || 'an event'}" — review it and publish.` });
  };

  const selectCourse = (course: Course | null) => {
    setSelectedCourseId(course?.id || null);
    setCourseForm(course ? { ...course } : emptyCourse());
    setSelectedModuleId(course?.modules?.[0]?.id || null);
    setSelectedLessonId(course?.modules?.[0]?.lessons?.[0]?.id || null);
    setModuleForm(course?.modules?.[0] || { title: '', description: '', sortOrder: 0 });
    setLessonForm(course?.modules?.[0]?.lessons?.[0] || emptyLesson);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, target: 'job' | 'event' | 'course') => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSaving(true);
    const imageUrl = await db.uploadContentImage(file);
    setSaving(false);

    if (!imageUrl) {
      showMessage({ type: 'error', text: 'Image upload failed.' });
      return;
    }

    if (target === 'job') setJobForm((prev) => ({ ...prev, logo: imageUrl }));
    if (target === 'event') setEventForm((prev) => ({ ...prev, image: imageUrl }));
    if (target === 'course') setCourseForm((prev) => ({ ...prev, image: imageUrl, thumbnail: imageUrl }));
    showMessage({ type: 'success', text: 'Image uploaded.' });
  };

  const handleJobSave = async (nextStatus?: ContentStatus) => {
    if (!jobForm.title || !jobForm.company || !jobForm.location) {
      showMessage({ type: 'error', text: 'Job title, company, and location are required.' });
      return;
    }

    setSaving(true);
    const payload: Partial<Job> = {
      ...jobForm,
      status: nextStatus || jobForm.status || 'draft',
      skills: inputToArray(jobSkillsInput),
      requirements: inputToArray(jobRequirementsInput),
      responsibilities: inputToArray(jobResponsibilitiesInput),
      deliverables: inputToArray(jobDeliverablesInput),
      proposalRequired: jobForm.proposalRequired ?? ['Gig', 'Project'].includes(jobForm.category || ''),
    };

    const success = selectedJobId
      ? await db.updateJob(selectedJobId, payload, jobs.find((job) => job.id === selectedJobId)?.status)
      : await db.createJob(payload);

    setSaving(false);

    if (!success) {
      showMessage({ type: 'error', text: 'Unable to save job.' });
      return;
    }

    await loadAdminData();
    const nextSelected = selectedJobId ? jobs.find((job) => job.id === selectedJobId) : null;
    selectJob(nextSelected || null);
    showMessage({ type: 'success', text: nextStatus === 'published' ? 'Job published.' : 'Job saved.' });
  };

  const handleEventSave = async (nextStatus?: ContentStatus) => {
    if (!eventForm.title || !eventForm.date || !eventForm.location) {
      showMessage({ type: 'error', text: 'Event title, date, and location are required.' });
      return;
    }

    setSaving(true);
    const payload: Partial<AppEvent> = {
      ...eventForm,
      contentStatus: nextStatus || eventForm.contentStatus || 'draft',
      tags: inputToArray(eventTagsInput),
    };

    const success = selectedEventId
      ? await db.updateEvent(selectedEventId, payload, events.find((event) => event.id === selectedEventId)?.contentStatus)
      : await db.createEvent(payload);

    setSaving(false);

    if (!success) {
      showMessage({ type: 'error', text: 'Unable to save event.' });
      return;
    }

    await loadAdminData();
    showMessage({ type: 'success', text: nextStatus === 'published' ? 'Event published.' : 'Event saved.' });
  };

  const handleCourseSave = async (nextStatus?: CourseStatus) => {
    if (!courseForm.title || !courseForm.provider) {
      showMessage({ type: 'error', text: 'Course title and provider are required.' });
      return;
    }
    const existingCourse = selectedCourseId ? courses.find((course) => course.id === selectedCourseId) : null;
    if (nextStatus === 'published') {
      if (!selectedCourseId) {
        showMessage({ type: 'error', text: 'Save the course as a draft before publishing it.' });
        return;
      }
      const publishIssues = getCoursePublishIssues(courseForm, existingCourse);
      if (publishIssues.length) {
        showMessage({ type: 'error', text: publishIssues.slice(0, 2).join(' ') });
        return;
      }
    }

    if (nextStatus === 'published' && courseForm.generationJobId && (courseForm.evalScore ?? 0) < 80) {
      showMessage({ type: 'error', text: 'Zara-generated courses need an eval score of 80 or higher before publishing.' });
      return;
    }

    setSaving(true);
    const payload: Partial<Course> = {
      ...courseForm,
      // Preserve an approved state while publishing; the database RPC performs the final gate.
      status: nextStatus === 'published' ? existingCourse?.status || courseForm.status || 'draft' : nextStatus || courseForm.status || 'draft',
    };

    const success = selectedCourseId
      ? await db.updateCourse(selectedCourseId, payload, courses.find((course) => course.id === selectedCourseId)?.status)
      : await db.createCourse(payload);

    setSaving(false);

    if (!success) {
      showMessage({ type: 'error', text: 'Unable to save course.' });
      return;
    }

    if (nextStatus === 'published' && selectedCourseId) {
      const published = await db.publishCourse(selectedCourseId);
      if (!published.success) {
        setSaving(false);
        showMessage({ type: 'error', text: published.error || 'Unable to publish course.' });
        await loadAdminData();
        return;
      }
    }

    await loadAdminData();
    showMessage({ type: 'success', text: nextStatus === 'published' ? 'Course published.' : 'Course saved.' });
  };

  const handleCourseReviewStatus = async (nextStatus: Exclude<CourseStatus, 'published'>) => {
    if (!selectedCourseId) {
      showMessage({ type: 'error', text: 'Save the course as a draft before starting review.' });
      return;
    }
    const existingCourse = courses.find((course) => course.id === selectedCourseId) || null;
    if (nextStatus === 'in_review') {
      const issues = getCourseReviewIssues(courseForm, existingCourse);
      if (issues.length) {
        showMessage({ type: 'error', text: issues.slice(0, 2).join(' ') });
        return;
      }
    }

    setSaving(true);
    const saved = await db.updateCourse(selectedCourseId, {
      ...courseForm,
      // Keep the current state while saving edits; the RPC controls the transition.
      status: existingCourse?.status || 'draft',
    }, existingCourse?.status);
    if (!saved) {
      setSaving(false);
      showMessage({ type: 'error', text: 'Unable to save course changes before review.' });
      return;
    }

    const result = await db.setCourseReviewStatus(selectedCourseId, nextStatus);
    setSaving(false);
    if (!result.success) {
      showMessage({ type: 'error', text: result.error || 'Unable to update review status.' });
      await loadAdminData();
      return;
    }

    await loadAdminData();
    const refreshed = await db.getCourseById(selectedCourseId);
    if (refreshed) selectCourse(refreshed);
    setCourseVersions(await db.getCourseVersions(selectedCourseId));
    showMessage({ type: 'success', text: nextStatus === 'in_review' ? 'Course submitted for review.' : nextStatus === 'approved' ? 'Course approved.' : 'Course returned to draft.' });
  };

  const handleRestoreCourseVersion = async (versionId: string) => {
    if (!selectedCourseId || !window.confirm('Restore this version? The current course will remain in history, and the restored course will return to draft.')) return;
    setSaving(true);
    const result = await db.restoreCourseVersion(versionId);
    setSaving(false);
    if (!result.success) {
      showMessage({ type: 'error', text: result.error || 'Unable to restore course version.' });
      return;
    }
    await loadAdminData();
    const refreshed = await db.getCourseById(selectedCourseId);
    if (refreshed) selectCourse(refreshed);
    setCourseVersions(await db.getCourseVersions(selectedCourseId));
    showMessage({ type: 'success', text: 'Version restored as a draft.' });
  };

  const handleDelete = async (type: TabKey) => {
    if (!window.confirm(`Delete this ${type.slice(0, -1)}?`)) return;
    setSaving(true);

    let success = false;
    // Courses report why they could not be deleted — an enrolled course is
    // blocked by a foreign key, and "unable to delete" alone sends the admin
    // looking in the wrong place.
    let reason = '';
    if (type === 'jobs' && selectedJobId) success = await db.deleteJob(selectedJobId);
    if (type === 'events' && selectedEventId) success = await db.deleteEvent(selectedEventId);
    if (type === 'courses' && selectedCourseId) {
      const result = await db.deleteCourse(selectedCourseId);
      success = result.success;
      reason = result.error ?? '';
    }

    setSaving(false);

    if (!success) {
      showMessage({ type: 'error', text: reason || `Unable to delete ${type.slice(0, -1)}.` });
      return;
    }

    await loadAdminData();
    if (type === 'jobs') selectJob(null);
    if (type === 'events') selectEvent(null);
    if (type === 'courses') selectCourse(null);
    showMessage({ type: 'success', text: `${type.slice(0, -1)} deleted.` });
  };

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) || null;
  const selectedModule = selectedCourse?.modules?.find((module) => module.id === selectedModuleId) || null;

  // Hydrate a course selected from the previous admin session once the async list arrives.
  useEffect(() => {
    if (selectedCourse && selectedCourseId && !courseForm.title) selectCourse(selectedCourse);
  }, [selectedCourseId, selectedCourse, courseForm.title]);

  const handleModuleSave = async () => {
    if (!selectedCourseId || !moduleForm.title) {
      showMessage({ type: 'error', text: 'Choose a course and add a module title.' });
      return;
    }
    setSaving(true);
    const success = selectedModuleId
      ? await db.updateCourseModule(selectedModuleId, moduleForm)
      : await db.createCourseModule(selectedCourseId, moduleForm);
    setSaving(false);
    if (!success) {
      showMessage({ type: 'error', text: 'Unable to save module.' });
      return;
    }
    const wasPublished = selectedCourseId && courses.find((course) => course.id === selectedCourseId)?.status === 'published';
    if (wasPublished) await db.setCourseStatus(selectedCourseId, 'draft');
    await loadAdminData();
    showMessage({ type: 'success', text: wasPublished ? 'Module saved. Course moved back to draft for review.' : 'Module saved.' });
  };

  const handleLessonSave = async () => {
    if (!selectedModuleId || !lessonForm.title) {
      showMessage({ type: 'error', text: 'Choose a module and add a lesson title.' });
      return;
    }
    setSaving(true);
    const success = selectedLessonId
      ? await db.updateCourseLesson(selectedLessonId, lessonForm)
      : await db.createCourseLesson(selectedModuleId, lessonForm);
    setSaving(false);
    if (!success) {
      showMessage({ type: 'error', text: 'Unable to save lesson.' });
      return;
    }
    const wasPublished = selectedCourseId && courses.find((course) => course.id === selectedCourseId)?.status === 'published';
    if (wasPublished) await db.setCourseStatus(selectedCourseId, 'draft');
    await loadAdminData();
    showMessage({ type: 'success', text: wasPublished ? 'Lesson saved. Course moved back to draft for review.' : 'Lesson saved.' });
  };

  const handleModuleDelete = async () => {
    if (!selectedModuleId || !window.confirm('Delete this module and its lessons?')) return;
    setSaving(true);
    const success = await db.deleteCourseModule(selectedModuleId);
    setSaving(false);
    if (!success) {
      showMessage({ type: 'error', text: 'Unable to delete module.' });
      return;
    }
    await loadAdminData();
    setSelectedModuleId(null);
    setSelectedLessonId(null);
    setModuleForm({ title: '', description: '', sortOrder: 0 });
    setLessonForm(emptyLesson);
    showMessage({ type: 'success', text: 'Module deleted.' });
  };

  const handleLessonDelete = async () => {
    if (!selectedLessonId || !window.confirm('Delete this lesson?')) return;
    setSaving(true);
    const success = await db.deleteCourseLesson(selectedLessonId);
    setSaving(false);
    if (!success) {
      showMessage({ type: 'error', text: 'Unable to delete lesson.' });
      return;
    }
    await loadAdminData();
    setSelectedLessonId(null);
    setLessonForm(emptyLesson);
    showMessage({ type: 'success', text: 'Lesson deleted.' });
  };

  const handleResourceStatus = async (resourceId: string, status: CourseResourceStatus) => {
    const success = await db.updateCourseResourceStatus(resourceId, status);
    if (!success) {
      showMessage({ type: 'error', text: 'Unable to update resource.' });
      return;
    }
    if (selectedCourseId) setCourseResources(await db.getCourseResources(selectedCourseId));
    showMessage({ type: 'success', text: `Resource ${status}.` });
  };

  const courseImportDeps = {
    db,
    showMessage,
    setSaving,
    loadAdminData,
    setSelectedCourseId,
  };

  const handleTemplateDownload = () => downloadCourseTemplate();

  const handleCourseImport = (e: React.ChangeEvent<HTMLInputElement>) => importCourseFromFileInput(e, courseImportDeps);

  const handleImportZaraDraft = (draftOverride?: ZaraCourseDraft) =>
    importZaraDraft<Partial<Record<TabKey, boolean>>>(
      {
        db,
        zaraDraft,
        zaraJobId,
        showMessage,
        setSaving,
        loadAdminData,
        refreshZaraBuildArtifacts,
        setSelectedCourseId,
        setActiveTab,
        setExpandedAdminSections,
      },
      draftOverride,
    );

  const handleDownloadScorm = () =>
    downloadScormPackage({
      db,
      buildScorm12Package,
      selectedCourse,
      showMessage,
      setScormLoading,
      refreshZaraBuildArtifacts,
    });

  if (loading) {
    // Same branded splash as app boot, so entering the admin console does not
    // drop to a bare text line mid-transition.
    return <SplashScreen variant="full" message="Loading admin workspace" />;
  }

  // Real is_admin from the database, in every environment. No localhost/dev
  // bypass and no "role === 'Admin'" shortcut: `role` is a free-text title the
  // user types. The database enforces the same rule through is_admin() in RLS.
  // To make yourself an admin locally, see
  // supabase/migrations/20260918120100_retire_first_user_admin.sql.
  const isAuthorizedAdmin = user?.isAdmin === true;

  if (!isAuthorizedAdmin) {
    return (
      <div className="ag-app min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="font-display text-3xl font-semibold text-secondary-900 mb-2">Access denied</h1>
        <p className="text-slate-600 mb-6">This area is limited to admins with content publishing access.</p>
        <Button onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
      </div>
    );
  }

  const navItems: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'ai', label: 'AI Assistant', icon: Sparkles },
    { key: 'blogs', label: 'Blogs & Stories', icon: Newspaper },
    { key: 'jobs', label: 'Jobs', icon: Briefcase },
    { key: 'events', label: 'Events', icon: Calendar },
    { key: 'courses', label: 'Courses', icon: BookOpen },
    { key: 'builder', label: 'Course Factory', icon: Layers3 },
    { key: 'knowledge', label: 'Knowledge Vault', icon: Library },
    { key: 'users', label: 'Users', icon: Users },
    { key: 'settings', label: 'AI Settings', icon: Sliders },
  ];

  const builderHistory = courseBuildJobs.map((job) => {
    const course = job.courseId ? courses.find((item) => item.id === job.courseId) : null;
    return {
      id: course?.id || `build-${job.id}`,
      title: course?.title || job.settings?.prompt || 'Untitled course build',
      status: job.state,
      generationJobId: job.id,
      courseId: job.courseId,
    };
  });

  const lessonCountText = (item: LibraryItem) => `${item.lessonCount || 0} lessons`;
  const contentStatusOf = (item: LibraryItem) => item.contentStatus;
  const statusOf = (item: LibraryItem) => item.status;

  const inertTab = {
    selectedId: null,
    editorTitle: null,
    secondaryText: lessonCountText,
    itemStatus: statusOf,
    onSelectItem: null,
    onNewItem: null,
    onDelete: null,
    onSaveDraft: null,
    onPublish: null,
    composeAction: null,
  } as const;

  const adminTabs: Record<TabKey, AdminTabEntry> = {
    ai: { ...inertTab, collection: [] },
    knowledge: { ...inertTab, collection: [] },
    blogs: {
      collection: blogs.map((b) => ({
        id: b.id,
        title: b.title,
        secondaryText: b.author.name,
        status: b.status,
      })),
      selectedId: selectedBlogId,
      editorTitle: selectedBlogId ? 'Edit Article' : 'New Article',
      secondaryText: (item) => (item as any).secondaryText || 'AfroGrad Journal',
      itemStatus: (item) => item.status,
      onSelectItem: (item) => setSelectedBlogId(item.id),
      onNewItem: () => setSelectedBlogId(null),
      onDelete: () => {
        if (selectedBlogId) {
          blogStorage.delete(selectedBlogId);
          refreshBlogs();
          setSelectedBlogId(null);
          showMessage({ type: 'success', text: 'Article deleted.' });
        }
      },
      onSaveDraft: () => {
        const item = blogs.find((b) => b.id === selectedBlogId);
        if (item) {
          blogStorage.save({ ...item, status: 'draft' });
          refreshBlogs();
          showMessage({ type: 'success', text: 'Saved as draft.' });
        }
      },
      onPublish: () => {
        const item = blogs.find((b) => b.id === selectedBlogId);
        if (item) {
          blogStorage.save({ ...item, status: 'published' });
          refreshBlogs();
          showMessage({ type: 'success', text: 'Article published!' });
        }
      },
      composeAction: {
        label: 'Draft with Zara',
        agentName: 'Zara',
        onClick: () => { setAiAgent('academic'); setActiveTab('ai'); },
      },
    },
    jobs: {
      collection: jobs,
      selectedId: selectedJobId,
      editorTitle: selectedJobId ? 'Edit job' : 'New job',
      secondaryText: (item) => item.company,
      itemStatus: statusOf,
      onSelectItem: (item) => selectJob(item as Job),
      onNewItem: () => selectJob(null),
      onDelete: () => { void handleDelete('jobs'); },
      onSaveDraft: () => { void handleJobSave('draft'); },
      onPublish: () => { void handleJobSave('published'); },
      composeAction: {
        label: 'Draft with Kwame',
        agentName: 'Kwame',
        onClick: () => { setAiAgent('job_creator'); setActiveTab('ai'); },
      },
    },
    events: {
      collection: events,
      selectedId: selectedEventId,
      editorTitle: selectedEventId ? 'Edit event' : 'New event',
      secondaryText: (item) => item.date,
      itemStatus: contentStatusOf,
      onSelectItem: (item) => selectEvent(item as AppEvent),
      onNewItem: () => selectEvent(null),
      onDelete: () => { void handleDelete('events'); },
      onSaveDraft: () => { void handleEventSave('draft'); },
      onPublish: () => { void handleEventSave('published'); },
      composeAction: {
        label: 'Plan with Efia',
        agentName: 'Efia',
        onClick: () => { setAiAgent('event_planner'); setActiveTab('ai'); },
      },
    },
    courses: {
      collection: courses,
      selectedId: selectedCourseId,
      editorTitle: selectedCourseId ? 'Edit course' : 'New course',
      secondaryText: lessonCountText,
      itemStatus: statusOf,
      onSelectItem: (item) => selectCourse(item as Course),
      onNewItem: () => selectCourse(null),
      onDelete: () => { void handleDelete('courses'); },
      onSaveDraft: () => { void handleCourseSave('draft'); },
      onPublish: null,
      composeAction: null,
    },
    builder: {
      ...inertTab,
      collection: builderHistory,
      onSelectItem: (item) => { void openBuildInFactory(item as BuilderHistoryItem); },
      onNewItem: startNewFactoryBuild,
    },
    users: { ...inertTab, collection: allMembers },
    settings: { ...inertTab, collection: [] },
  };

  const activeTabEntry = adminTabs[activeTab];

  const adminUser: UserProfile = (user || currentUser || {
    id: 'admin-user',
    name: 'Admin',
    email: 'admin@afrograd.com',
    role: 'admin',
    company: 'AfroGrad',
    location: 'Africa',
    avatar: '',
    skills: [],
    bio: 'AfroGrad Administrator',
    linkedinUrl: '',
    education: '',
    educationLevel: '',
    fieldOfStudy: '',
  }) as unknown as UserProfile;

  const zaraBuilderPanel = (
    <div className="h-full flex flex-col overflow-hidden">
      <DashboardStudioView
        user={adminUser}
        jobs={jobs}
        courses={courses}
        drafts={drafts}
        onSaveDraft={(draft) => {
          addDraft(draft);
          if (draft.type === 'course') {
            setCourseForm({
              ...emptyCourse(),
              id: draft.id,
              title: draft.title,
              description: draft.content.slice(0, 300),
            });
            showMessage({ type: 'success', text: `Course curriculum saved: "${draft.title}". Ready in Courses tab.` });
          }
        }}
        onToggleDrafts={toggleDrafts}
        activeDraft={activeDraft}
        onSelectDraft={setActiveDraft}
        onHeaderControlsChange={setStudioHeaderControls}
        mode="course"
      />
    </div>
  );

  const generalAiPanel = (
    <div className="h-full flex flex-col overflow-hidden">
      <DashboardStudioView
        user={adminUser}
        jobs={jobs}
        courses={courses}
        drafts={drafts}
        onSaveDraft={(draft) => {
          addDraft(draft);
          if (draft.type === 'course') {
            setCourseForm({
              ...emptyCourse(),
              id: draft.id,
              title: draft.title,
              description: draft.content.slice(0, 300),
            });
            showMessage({ type: 'success', text: `Saved course draft "${draft.title}". You can review it in Courses.` });
          }
        }}
        onToggleDrafts={toggleDrafts}
        activeDraft={activeDraft}
        onSelectDraft={setActiveDraft}
        onHeaderControlsChange={setStudioHeaderControls}
        mode="general"
      />
    </div>
  );

  return (
    <div className="ag-app min-h-screen bg-canvas text-fg font-sans selection:bg-brand-100 selection:text-brand-800">
      <div className="space-y-0 md:ml-14">
        {message && (
          <div className={`mx-4 my-3 rounded-[2px] border px-4 py-2.5 flex items-center gap-3 ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span className="font-medium text-xs">{message.text}</span>
          </div>
        )}

        <div className="flex items-start">
          <aside className="fixed inset-y-0 left-0 z-[60] hidden shrink-0 flex-col items-center justify-between border-r border-slate-200 bg-surface py-3 w-14 md:flex select-none">
            {/* Top Logo and Nav Icons */}
            <div className="flex flex-col items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="size-9 rounded-[2px] flex items-center justify-center hover:opacity-85 transition-opacity"
                title="AfroGrad Home"
              >
                <img src={logo} alt="AfroGrad" className="size-6 object-contain" />
              </button>
              <ThemeToggle variant="compact" />

              <div className="w-8 h-px bg-slate-200 my-0.5" />

              <nav className="flex flex-col items-center gap-1.5" aria-label="Admin Navigation">
                {navItems.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    title={label}
                    className={`size-10 rounded-[2px] flex items-center justify-center transition-colors ${
                      activeTab === key
                        ? 'bg-filled text-white shadow-2xs'
                        : 'text-slate-500 hover:text-secondary-900 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                  </button>
                ))}
              </nav>
            </div>

            {/* Bottom Profile and Return Button */}
            <div className="flex flex-col items-center gap-2 w-full pt-3 border-t border-slate-200">
              {/* Drafts and chat history, the same drawer the learner dashboard has. */}
              <button
                type="button"
                onClick={toggleDrafts}
                title={`Drafts and history (${drafts.length})`}
                aria-label={`Drafts and history (${drafts.length})`}
                aria-expanded={isDraftsOpen}
                className={`relative size-8 rounded-[2px] flex items-center justify-center transition-colors ${
                  isDraftsOpen ? 'bg-filled text-white' : 'text-slate-500 hover:text-secondary-900 hover:bg-slate-100'
                }`}
              >
                <FileText className="h-4 w-4" />
                {drafts.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid min-w-3.5 place-items-center rounded-pill bg-filled px-1 text-[9px] font-bold leading-[14px] text-filled-fg">
                    {drafts.length > 99 ? '99+' : drafts.length}
                  </span>
                )}
              </button>
              <span className="grid size-8 shrink-0 place-items-center rounded-[2px] border border-slate-200 bg-slate-100 text-xs font-bold text-secondary-900" title={user?.name || 'Admin'}>
                {(user?.name || 'AD').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                title="Return to Learner Dashboard"
                className="size-8 rounded-[2px] flex items-center justify-center text-slate-500 hover:text-secondary-900 hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
          </aside>

          {/* Scrolls rather than shrinking: nine 40px targets do not fit a
              narrow phone, and shrinking them would put the tap area under the
              accessible minimum. */}
          <nav className="rail-scroll fixed inset-x-0 bottom-0 z-[60] flex h-14 items-center gap-1 overflow-x-auto border-t border-slate-200 bg-surface px-2 md:hidden">
            {navItems.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                aria-label={label}
                className={`grid size-10 shrink-0 place-items-center rounded-[2px] ${
                  activeTab === key ? 'bg-filled text-white' : 'text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </nav>

          <main
            className={`min-w-0 flex-1 bg-canvas ${
              activeTab === 'ai' || activeTab === 'builder' || activeTab === 'knowledge'
                ? 'h-screen overflow-hidden p-0'
                : 'space-y-6 p-4 pb-20 sm:p-6 md:pb-6'
            }`}
          >
        {activeTab === 'users' && (
          <AdminUsersTab
            allMembers={allMembers}
            userSearch={userSearch}
            setUserSearch={setUserSearch}
            selectedMember={selectedMember}
            setSelectedMember={setSelectedMember}
          />
        )}

        {activeTab === 'ai' ? (
          generalAiPanel
        ) : activeTab === 'builder' ? (
          zaraBuilderPanel
        ) : activeTab === 'knowledge' ? (
          <DashboardKnowledgeView onBackToChat={() => setActiveTab('ai')} />
        ) : activeTab === 'settings' ? (
          <AdminSettingsTab showMessage={showMessage} />
        ) : (
          <div className="flex gap-4 items-start">
            {/* ── Library sidebar (collapsible) ── */}
            <AdminLibrarySidebar
              entry={activeTabEntry}
              activeTab={activeTab}
              libraryOpen={libraryOpen}
              setLibraryOpen={setLibraryOpen}
              headerExtra={activeTab === 'courses' && (
                <>
                  <input type="file" accept=".json" id="course-json-import" className="hidden" onChange={handleCourseImport} />
                  <label htmlFor="course-json-import" title="Import JSON" className="cursor-pointer rounded-[2px] border border-slate-200 p-1.5 text-slate-500 hover:text-secondary-900 transition-colors">
                    <FilePlus2 className="w-3.5 h-3.5" />
                  </label>
                  <button onClick={handleTemplateDownload} title="Download template" className="rounded-[2px] border border-slate-200 p-1.5 text-slate-500 hover:text-secondary-900 transition-colors">
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            />

          <section className="admin-editor-shell flex-1 min-w-0 bg-surface border border-slate-200 rounded-[2px] shadow-2xs overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Editor</p>
                <h2 className="font-editorial text-2xl font-bold text-secondary-900">
                  {activeTabEntry.editorTitle}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeTabEntry.composeAction && (
                  <Button variant="outline" onClick={activeTabEntry.composeAction.onClick}>
                    <Sparkles className="w-4 h-4" />
                    {activeTabEntry.composeAction.label}
                  </Button>
                )}
                <Button variant="outline" onClick={() => activeTabEntry.onSaveDraft?.()} isLoading={saving}>
                  <Save className="w-4 h-4" />
                  Save draft
                </Button>
                {activeTab !== 'courses' ? (
                  <Button onClick={() => activeTabEntry.onPublish?.()} isLoading={saving}>
                    <CheckCircle2 className="w-4 h-4" />
                    Publish
                  </Button>
                ) : selectedCourseId && selectedCourse ? (
                  <Button onClick={() => {
                    if (selectedCourse.status === 'draft') void handleCourseReviewStatus('in_review');
                    else if (selectedCourse.status === 'in_review') void handleCourseReviewStatus('approved');
                    else if (selectedCourse.status === 'approved') void handleCourseSave('published');
                  }} isLoading={saving} disabled={selectedCourse.status === 'published' || selectedCourse.status === 'archived'}>
                    <CheckCircle2 className="w-4 h-4" />
                    {selectedCourse.status === 'draft' ? 'Submit for review' : selectedCourse.status === 'in_review' ? 'Approve' : selectedCourse.status === 'approved' ? 'Publish' : 'Released'}
                  </Button>
                ) : null}
                {activeTab === 'courses' && selectedCourseId && (
                  <Button variant="outline" onClick={handleDownloadScorm} isLoading={scormLoading}>
                    <Download className="w-4 h-4" />
                    SCORM
                  </Button>
                )}
                {activeTabEntry.onDelete && activeTabEntry.selectedId && (
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={activeTabEntry.onDelete} isLoading={saving}>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-8">
              {activeTab === 'blogs' && (
                <AdminBlogsTab
                  blogs={blogs}
                  selectedBlogId={selectedBlogId}
                  onSelectBlog={(blog) => setSelectedBlogId(blog ? blog.id : null)}
                  onRefresh={refreshBlogs}
                  showMessage={showMessage}
                />
              )}

              {activeTab === 'jobs' && (
                <AdminJobsTab
                  jobForm={jobForm}
                  setJobForm={setJobForm}
                  jobSkillsInput={jobSkillsInput}
                  setJobSkillsInput={setJobSkillsInput}
                  jobRequirementsInput={jobRequirementsInput}
                  setJobRequirementsInput={setJobRequirementsInput}
                  jobResponsibilitiesInput={jobResponsibilitiesInput}
                  setJobResponsibilitiesInput={setJobResponsibilitiesInput}
                  jobDeliverablesInput={jobDeliverablesInput}
                  setJobDeliverablesInput={setJobDeliverablesInput}
                  selectedJobId={selectedJobId}
                  jobApplications={jobApplications}
                  onImageUpload={(event) => handleImageUpload(event, 'job')}
                />
              )}

              {activeTab === 'events' && (
                <AdminEventsTab
                  eventForm={eventForm}
                  setEventForm={setEventForm}
                  eventTagsInput={eventTagsInput}
                  setEventTagsInput={setEventTagsInput}
                  onImageUpload={(event) => handleImageUpload(event, 'event')}
                />
              )}

              {activeTab === 'courses' && (
                <AdminCourseTab
                  courseForm={courseForm}
                  setCourseForm={setCourseForm}
                  selectedCourseId={selectedCourseId}
                  selectedCourse={selectedCourse}
                  courseVersions={courseVersions}
                  courseQuizAttempts={courseQuizAttempts}
                  courseResources={courseResources}
                  saving={saving}
                  onImageUpload={(event) => handleImageUpload(event, 'course')}
                  handleCourseReviewStatus={handleCourseReviewStatus}
                  handleCourseSave={handleCourseSave}
                  handleRestoreCourseVersion={handleRestoreCourseVersion}
                  handleResourceStatus={handleResourceStatus}
                  structureEditor={{
                    selectedCourse,
                    selectedModule,
                    emptyLesson,
                    modulePanelOpen,
                    setModulePanelOpen,
                    moduleForm,
                    setModuleForm,
                    lessonForm,
                    setLessonForm,
                    selectedModuleId,
                    setSelectedModuleId,
                    selectedLessonId,
                    setSelectedLessonId,
                    saving,
                    showMessage,
                    handleModuleSave,
                    handleModuleDelete,
                    handleLessonSave,
                    handleLessonDelete,
                    onLessonImageUpload: async (file) => {
                      setSaving(true);
                      const url = await db.uploadContentImage(file);
                      setSaving(false);
                      if (!url) showMessage({ type: 'error', text: 'Image upload failed.' });
                      return url;
                    },
                  }}
                />
              )}
            </div>
          </section>
        </div>
        )}
          </main>
        </div>
      </div>

      <DashboardDraftsDrawer
        isOpen={isDraftsOpen}
        onClose={() => setIsDraftsOpen(false)}
        drafts={drafts}
        activeDraftId={activeDraft?.id}
        onDeleteDraft={deleteDraft}
        onSelectDraft={(draft) => {
          setActiveDraft(draft);
          setActiveTab('ai');
          setIsDraftsOpen(false);
        }}
        sessions={studioHeaderControls?.sessions ?? lastStudioSessions}
        activeSessionId={studioHeaderControls?.currentSessionId ?? null}
        onSelectSession={(id) => {
          studioHeaderControls?.onSelectSession(id);
          setActiveTab('ai');
          setIsDraftsOpen(false);
        }}
        onDeleteSession={studioHeaderControls?.onDeleteSession}
        activeTab={draftsTab}
        onActiveTabChange={setDraftsTab}
      />
    </div>
  );
};
