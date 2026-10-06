
import React, { useEffect, useState, useRef } from 'react';
import logo from '../assets/afrograd-logo.png';
import { ViewState, Job, Course, Event as AppEvent, University, UserProfile } from '../types';
import { Button } from './Button';
import { db } from '../services/db';
import { JobsList, CoursesList, HackathonsList, UniversitiesList, MentorsList } from './SharedViews';
import { Search, ChevronDown, LogOut, LayoutDashboard, Menu, X, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LegalLinks } from './legal/LegalPage';

/** Union of the collections `db.getSeedData` / the public views render. */
type SeedItem = Job | Course | AppEvent | University | UserProfile;

const fullFaqs = [
  {
    category: "Platform & Process",
    question: "How does the learning process work?",
    answer: "Jeli is a career operating system where you learn in structured pathways, work on real projects, receive peer and mentor feedback, and build a verified portfolio to prove your skills."
  },
  {
    category: "Platform & Process",
    question: "Will I get a new job after graduation?",
    answer: "While we do not guarantee employment, our platform connects you directly with recruiters, startups, and remote gigs, and helps you optimize your resume, portfolio, and applications using AI coaches."
  },
  {
    category: "Platform & Process",
    question: "What if I don't get a new job?",
    answer: "You will retain lifetime access to the community, peer network, and AI tools, so you can continue building projects, finding contract gigs, and refining your skills until you secure your next role."
  },
  {
    category: "Platform & Process",
    question: "Is the platform free to use?",
    answer: "Yes, the core Jeli platform—including access to all learning pathways, public jobs, university portals, and basic AI assistant tools—is completely free for students."
  },
  {
    category: "Mentorship",
    question: "How do I connect with industry mentors?",
    answer: "Browse our Mentor Network, filter by domain expertise or location, and send a connection request. Once connected, you can message them directly, share your projects, and request guidance."
  },
  {
    category: "Mentorship",
    question: "How often can I schedule calls or request reviews?",
    answer: "Mentors set their own availability on the platform. Once connected, you can coordinate message-based feedback on demand, or schedule live 1:1 video calls if the mentor has designated calendar slots available."
  },
  {
    category: "AI Coaches",
    question: "Who are the AI Career Coaches?",
    answer: "We have built specialized, domain-specific AI agents to guide you 24/7: Zara (Curriculum and Learning), Karim (Resume, Cover Letters, and Networking), Kofi (Startup and Entrepreneurship), and Amara (Grad School Applications & SOPs)."
  },
  {
    category: "AI Coaches",
    question: "Are there usage limits for AI interactions?",
    answer: "To ensure fair usage across our free tier, there is a daily message cap per user. Admins configure this limit, which you can see at the bottom of the chat panel. Premium tiers or sponsored hackathons may offer elevated limits."
  },
  {
    category: "Partners & Collaboration",
    question: "How can universities and partners collaborate?",
    answer: "Partner universities get a dedicated bridge portal to coordinate hackathons, webinars, and course curricula directly with industry leaders and track student outcomes."
  },
  {
    category: "Partners & Collaboration",
    question: "How do employers verify student skills?",
    answer: "Employers can review student profiles and check their progress records, course achievements, and actual portfolio projects. Feedback from mentors is also visible to recruiters on the student's public profile."
  }
];

interface PublicPagesProps {
  view: ViewState;
  onNavigate: (hash: string) => void;
  onLoginClick: () => void;
  user: UserProfile | null;
  onLogout?: () => void;
}

const siteNavItems = [
  { label: 'Learning', value: 'learning' },
  { label: 'Blog', value: 'blog' },
  { label: 'FAQ', value: 'faq' },
];

export const PublicPages: React.FC<PublicPagesProps> = ({ view, onNavigate, onLoginClick, user, onLogout }) => {
  const [data, setData] = useState<SeedItem[]>(() => db.getSeedData(view));
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [jobSearch, setJobSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('All');
  const [jobLocationFilter, setJobLocationFilter] = useState('All');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Clear the previous view's rows. Only real, published rows are shown:
    // sample content appears solely in dev seed mode (services/db/seedMode.ts).
    let cancelled = false;
    setData(db.getSeedData(view));
    setLoadState('loading');
    const load = async () => {
      try {
        let rows: SeedItem[] = [];
        if (view === ViewState.JOBS) rows = await db.getJobs();
        else if (view === ViewState.LEARNING) rows = await db.getCourses();
        else if (view === ViewState.EVENTS) rows = await db.getEvents();
        else if (view === ViewState.UNIVERSITIES) rows = await db.getUniversities();
        else if (view === ViewState.MENTORSHIP) rows = await db.getMembers();
        if (cancelled) return;
        setData(rows);
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    };
    load();
    if (reloadKey === 0) window.scrollTo(0, 0);
    return () => {
      cancelled = true;
    };
  }, [view, reloadKey]);

  // design.md: the mobile menu prevents background scrolling while open.
  useEffect(() => {
    if (!isMenuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
      // design.md: a subtle scroll progress line beneath the nav. Written to the
      // DOM directly so scrolling doesn't re-render the page.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      }
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getTitle = () => {
    switch (view) {
      case ViewState.JOBS: return 'Jobs';
      case ViewState.LEARNING: return 'Learning Hub';
      case ViewState.EVENTS: return 'Hackathons & Events';
      case ViewState.UNIVERSITIES: return 'University Partners';
      case ViewState.MENTORSHIP: return 'Community Mentors';
      case ViewState.FAQ: return 'Frequently Asked Questions';
      default: return '';
    }
  };

  const getSubtitle = () => {
    switch (view) {
      case ViewState.JOBS: return 'Find roles, internships, contracts, gigs, and project work from trusted teams.';
      case ViewState.LEARNING: return 'Curated courses to master AI, Data Science, and Engineering.';
      case ViewState.EVENTS: return 'Compete, collaborate, and win prizes in our community hackathons.';
      case ViewState.UNIVERSITIES: return 'Connecting academic excellence with industry innovation.';
      case ViewState.MENTORSHIP: return 'Connect with experienced professionals who\'ve walked your path.';
      case ViewState.FAQ: return 'Got questions? We have answers. Learn how to get the most out of Jeli, connect with mentors, and accelerate your career.';
      default: return '';
    }
  };

  const handleAction = (_id: string) => {
    onLoginClick();
  };

  const jobs = data as Job[];
  const jobLocations = ['All', ...Array.from(new Set(jobs.map(job => job.location).filter(Boolean)))];
  const filteredJobs = jobs.filter(job => {
    const query = jobSearch.trim().toLowerCase();
    const matchesSearch = !query || [
      job.title,
      job.company,
      job.location,
      job.category,
      job.type,
      job.budgetType || '',
      job.estimatedTimeline || '',
      job.description || '',
      ...(job.skills || []),
      ...(job.deliverables || []),
    ].join(' ').toLowerCase().includes(query);
    const matchesType = jobFilter === 'All' || job.type === jobFilter || job.category === jobFilter;
    const matchesLocation = jobLocationFilter === 'All' || job.location === jobLocationFilter;

    return matchesSearch && matchesType && matchesLocation;
  });

  return (
    <div className="ag-static-light ag-home min-h-screen overflow-hidden w-full max-w-full overflow-x-hidden font-sans text-secondary-900">
      <nav
        style={{
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          backdropFilter: 'blur(20px) saturate(180%)',
        }}
        className={`ag-nav fixed left-3 right-3 top-3 z-50 mx-auto max-w-6xl px-3.5 py-2.5 sm:left-6 sm:right-6 sm:px-4 rounded-full transition-all duration-300 ${isScrolled ? 'ag-nav-scrolled' : 'ag-nav-top'}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 relative">
          <button 
            className="flex items-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500/30 shrink-0"
            onClick={() => onNavigate('')}
            aria-label="Go to AfroGrad home"
          >
            <img src={logo} alt="AfroGrad" className="h-8 object-contain drop-shadow-sm" />
          </button>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            {siteNavItems.map((item) => (
              <button
                key={item.value}
                onClick={() => onNavigate(item.value)}
                className={`ag-nav-link ${view.toLowerCase() === item.value.toLowerCase() ? 'ag-nav-link-active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button className="ag-nav-link hidden md:inline-flex" onClick={() => onNavigate('')}>Back to Home</button>
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 rounded-full p-1 border border-slate-200 bg-surface/80 hover:bg-surface shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="true"
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-8 h-8 rounded-full object-cover border border-slate-100"
                  />
                  <span className="text-sm font-medium text-slate-700 px-1 hidden sm:inline-block max-w-[120px] truncate">
                    {user.name.split(' ')[0]}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 mr-1 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-surface p-2.5 shadow-lg z-50">
                    <div className="px-3.5 py-2.5 border-b border-slate-100 mb-1.5">
                      <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                      <p className="text-xs text-slate-500 truncate">{user.role}</p>
                    </div>
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        navigate('/dashboard');
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4 text-slate-500" />
                      Dashboard
                    </button>
                    {onLogout && (
                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onLogout();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors mt-0.5"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button className="ag-nav-cta" onClick={onLoginClick}>Sign in</button>
            )}

            {/* Mobile hamburger menu toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 border border-slate-200 bg-surface/80 hover:bg-surface text-slate-700 rounded-xl md:hidden focus:outline-none focus:ring-2 focus:ring-brand-500/20 shrink-0"
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

          {/* Mobile dropdown panel */}
          {isMenuOpen && (
            <div className="absolute top-[52px] left-0 right-0 z-50 rounded-2xl border border-slate-200 bg-surface p-3 shadow-xl md:hidden">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { setIsMenuOpen(false); onNavigate(''); }}
                  className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  <Home className="w-4 h-4 text-slate-500" />
                  Back to Home
                </button>
                
                <div className="h-px bg-slate-100 my-1" />

                {siteNavItems.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => { setIsMenuOpen(false); onNavigate(item.value); }}
                    className={`rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-colors ${
                      view.toLowerCase() === item.value.toLowerCase()
                        ? 'bg-brand-50 text-brand-600 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="ag-nav-progress" aria-hidden="true">
          <div ref={progressRef} className="ag-nav-progress-bar" />
        </div>
      </nav>

      {/* Page Header */}
      <div className="ag-section mx-auto max-w-7xl px-4 pb-12 pt-40 sm:px-6 sm:pt-48 lg:pt-52 lg:px-8">
        <div className="max-w-3xl">
          <p className="ag-eyebrow">Jeli</p>
          <h1 className="ag-section-title mt-3 text-4xl md:text-5xl">{getTitle()}</h1>
          <p className="ag-lede mt-5 max-w-2xl">{getSubtitle()}</p>
        </div>
      </div>

      {/* Content Area */}
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="relative">
          <div className="min-h-[400px]">
            {view !== ViewState.FAQ && loadState === 'loading' && data.length === 0 && (
              <p role="status" className="py-16 text-center text-sm font-medium text-slate-500">Loading…</p>
            )}
            {view !== ViewState.FAQ && loadState === 'error' && (
              <div role="alert" className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-surface px-6 py-10 text-center">
                <p className="font-editorial text-lg font-bold text-secondary-900">We couldn't load this page</p>
                <p className="mt-2 text-sm text-slate-600">Check your connection and try again.</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="mt-5 inline-flex h-10 items-center rounded-xl bg-filled px-4 text-sm font-bold text-filled-fg hover:bg-filled-hover"
                >
                  Try again
                </button>
              </div>
            )}
            {(loadState === 'ready' || data.length > 0) && <>
            {view === ViewState.JOBS && (
              <div className="space-y-6">
                <div
                  style={{
                    WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                    backdropFilter: 'blur(12px) saturate(160%)',
                  }}
                  className="rounded-3xl border border-[#073264]/10 bg-white/60 p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row gap-3">
                      {/* Search */}
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#073264]/40" aria-hidden="true" />
                        <input
                          type="text"
                          value={jobSearch}
                          onChange={(event) => setJobSearch(event.target.value)}
                          placeholder="Search title, company, skill or keyword…"
                          aria-label="Search jobs"
                          style={{
                            WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                            backdropFilter: 'blur(12px) saturate(160%)',
                          }}
                          className="w-full rounded-full border border-[#073264]/15 bg-white/60 py-2.5 pl-9 pr-4 text-base sm:text-sm font-medium text-[#073264] placeholder-[#073264]/35 shadow-sm focus:border-[#073264]/40 focus:bg-white/80 focus:outline-none focus:ring-0"
                        />
                      </div>
                      {/* Location select */}
                      <select
                        value={jobLocationFilter}
                        onChange={(event) => setJobLocationFilter(event.target.value)}
                        style={{
                          WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                          backdropFilter: 'blur(12px) saturate(160%)',
                        }}
                        className="w-full lg:w-56 rounded-full border border-[#073264]/15 bg-white/60 px-4 py-2.5 text-sm font-medium text-[#073264] shadow-sm transition-all duration-200 focus:border-[#073264]/40 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-[#073264]/10"
                        aria-label="Filter jobs by location"
                      >
                        {jobLocations.map(location => (
                          <option key={location} value={location}>{location === 'All' ? 'All locations' : location}</option>
                        ))}
                      </select>
                    </div>
                    {/* Type filter pills */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {['All', 'Remote', 'Hybrid', 'On-site', 'Internship', 'Full-time', 'Contract', 'Gig', 'Project'].map(filter => (
                          <button
                            key={filter}
                            onClick={() => setJobFilter(filter)}
                            style={
                              jobFilter === filter
                                ? { WebkitBackdropFilter: 'blur(12px) saturate(160%)', backdropFilter: 'blur(12px) saturate(160%)' }
                                : { WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }
                            }
                            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all duration-200 ${
                              jobFilter === filter
                                ? 'bg-[#073264] text-white shadow-md shadow-[#073264]/20'
                                : 'border border-[#073264]/15 bg-white/50 text-[#073264]/70 hover:bg-white/80 hover:text-[#073264] hover:border-[#073264]/30 hover:shadow-sm'
                            }`}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                      <span className="shrink-0 text-xs font-medium text-slate-400">{filteredJobs.length} of {jobs.length} roles</span>
                    </div>
                  </div>
                </div>
                <JobsList jobs={filteredJobs} isPublic onAction={handleAction} onViewDetails={(job) => onNavigate(`jobs/${job.id}`)} />
              </div>
            )}
            {view === ViewState.LEARNING && <CoursesList courses={data as Course[]} isPublic onAction={handleAction} onViewDetails={(course) => onNavigate(`learning/${course.id}`)} />}
            {view === ViewState.EVENTS && <HackathonsList hackathons={data as AppEvent[]} isPublic onAction={handleAction} />}
            {view === ViewState.UNIVERSITIES && <UniversitiesList universities={data as University[]} isPublic onAction={handleAction} />}
            {view === ViewState.MENTORSHIP && <MentorsList members={data as UserProfile[]} isPublic onAction={handleAction} />}
            </>}

            {view === ViewState.FAQ && (
              <div className="space-y-12 max-w-4xl">
                {["Platform & Process", "Mentorship", "AI Coaches", "Partners & Collaboration"].map((category) => {
                  const categoryFaqs = fullFaqs.filter(f => f.category === category);
                  return (
                    <div key={category} className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-brand-600 border-b border-slate-200 pb-2">
                        {category}
                      </h3>
                      <div className="divide-y divide-slate-300/40">
                        {categoryFaqs.map((faq, idx) => {
                          const globalIdx = fullFaqs.findIndex(f => f.question === faq.question);
                          const isOpen = openFaqIndex === globalIdx;
                          return (
                            <div key={idx} className="transition-colors duration-300">
                              <button
                                onClick={() => setOpenFaqIndex(isOpen ? null : globalIdx)}
                                className="flex w-full items-center justify-between py-5 text-left focus:outline-none group"
                              >
                                <span className="text-base sm:text-lg font-medium text-secondary-900 group-hover:text-brand-600 transition-colors">
                                  {faq.question}
                                </span>
                                <span className="text-xl font-light text-slate-500 w-8 h-8 flex items-center justify-center">
                                  {isOpen ? '−' : '+'}
                                </span>
                              </button>
                              <div
                                className={`grid transition-colors duration-200 ease-in-out ${
                                  isOpen ? 'grid-rows-[1fr] opacity-100 pb-6' : 'grid-rows-[0fr] opacity-0 overflow-hidden'
                                }`}
                              >
                                <div className="overflow-hidden">
                                  <div className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-4xl pr-8">
                                    {faq.answer}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Login CTA */}
          <div className="mt-12 rounded-2xl border border-slate-300 bg-gradient-to-r from-white via-brand-50/60 to-secondary-50 p-6 text-left shadow-[0_16px_40px_rgba(7,50,100,0.07)] sm:p-10 md:flex md:items-center md:justify-between md:gap-8">
            {user ? (
              <>
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-semibold text-secondary-900 mb-3">Welcome back, {user.name.split(' ')[0]}</h3>
                  <p className="max-w-xl text-slate-700 leading-7">Go to your dashboard to manage your applications, enrolled courses, and connect with other community members.</p>
                </div>
                <div className="mt-6 md:mt-0">
                  <Button className="rounded-lg bg-brand-500 hover:bg-brand-600" size="lg" onClick={() => navigate('/dashboard')}>
                    Go to Dashboard
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-semibold text-secondary-900 mb-3">Unlock full access</h3>
                  <p className="max-w-xl text-slate-700 leading-7">Create a free account to apply for jobs, enroll in courses, and message mentors directly.</p>
                </div>
                <div className="mt-6 md:mt-0">
                  <Button className="rounded-lg bg-brand-500 hover:bg-brand-600" size="lg" onClick={onLoginClick}>
                    Join Community
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="bg-surface border-t border-slate-200 py-12 text-center text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} AfroGrad. Jeli is an AfroGrad product.</p>
        <LegalLinks className="mt-3" />
      </footer>
    </div>
  );
};
