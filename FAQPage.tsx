import React, { useState, useMemo, useRef, useEffect } from 'react';
import logo from '../assets/afrograd-logo.png';
import { useNavigate } from 'react-router-dom';
import { LegalLinks } from './legal/LegalPage';
import { UserProfile } from '../types';
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Search,
} from 'lucide-react';

interface FAQPageProps {
  user: UserProfile | null;
  onLoginClick: () => void;
  onLogout?: () => void;
}

interface FAQItem {
  category: string;
  question: string;
  answer: string;
}

const ALL_FAQS: FAQItem[] = [
  {
    category: 'Platform & Process',
    question: 'What is Jeli?',
    answer: 'Jeli, by AfroGrad, is a personalized learning platform for African learners from basic school through university, plus the teachers and institutions who support them. It brings curriculum, practice, feedback, and AI-assisted career planning into one learning experience.',
  },
  {
    category: 'Platform & Process',
    question: 'Why is AfroGrad focused on learning instead of grades?',
    answer: 'Grades are one signal, not the destination. AfroGrad focuses on reasoning, practice, reflection, and projects so learners can use what they know in real situations—not just memorize and reproduce answers in a standard exam.',
  },
  {
    category: 'Platform & Process',
    question: 'What countries is AfroGrad available in?',
    answer: 'AfroGrad is designed for learners and educators across Africa, with content, examples, and problem-solving contexts shaped around local realities and the needs of African classrooms.',
  },
  {
    category: 'Learning & Teaching',
    question: 'How does personalized learning work?',
    answer: 'Learners start at an appropriate level, follow a structured pathway, practice through problems and projects, and receive guidance based on how they reason and where they need support. The goal is a clearer next step for every student—not one fixed route for everyone.',
  },
  {
    category: 'Learning & Teaching',
    question: 'Can teachers use AfroGrad to develop curriculum?',
    answer: 'Yes. Teachers and institutions can shape pathways, organize lessons, create activities, and connect curriculum decisions to the skills learners need to demonstrate.',
  },
  {
    category: 'Learning & Teaching',
    question: 'What makes a project practical?',
    answer: 'A practical project asks learners to apply an idea to a real context, make a decision, create something useful, or explain their reasoning. Progress becomes visible in the work—not only in a test score.',
  },
  {
    category: 'AI Coaches',
    question: 'How does the AI support learning?',
    answer: 'AI should act as a coach, not an answer machine. It can ask questions, offer a hint, surface a misconception, or suggest another way to practice—but the learner still reasons, explains, creates, and decides.',
  },
  {
    category: 'AI Coaches',
    question: 'How does AI-assisted career planning work?',
    answer: 'The career coach helps learners explore possible directions, identify the skills each path requires, choose relevant learning, and turn those choices into a practical plan for the age of AI.',
  },
  {
    category: 'Partners & Collaboration',
    question: 'How can schools and institutions work with AfroGrad?',
    answer: 'Schools, training organizations, and education institutions can join the waitlist to explore curriculum partnerships, teacher tools, learner pilots, and locally relevant AI learning programs.',
  },
];

const CATEGORIES = [...new Set(ALL_FAQS.map((f) => f.category))];

export const FAQPage: React.FC<FAQPageProps> = ({ user, onLoginClick, onLogout }) => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_FAQS.filter((faq) => {
      const matchesCategory = activeCategory === 'All' || faq.category === activeCategory;
      const matchesSearch =
        !q || faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  // Group filtered results by category
  const grouped = useMemo(() => {
    const map: Record<string, FAQItem[]> = {};
    filtered.forEach((faq) => {
      if (!map[faq.category]) map[faq.category] = [];
      map[faq.category].push(faq);
    });
    return map;
  }, [filtered]);

  const globalIndex = (faq: FAQItem) => ALL_FAQS.findIndex((f) => f.question === faq.question);

  return (
    <div className="ag-static-light ag-home min-h-screen font-sans text-secondary-900 w-full max-w-full overflow-x-hidden">
      {/* ── Navbar ── */}
      <header className="fixed left-0 right-0 top-3 z-50 px-3 sm:top-5 sm:px-6">
        <nav
          style={{
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            backdropFilter: 'blur(20px) saturate(180%)',
          }}
          className={`ag-nav mx-auto flex max-w-6xl items-center justify-between gap-4 px-3.5 py-2.5 sm:px-4 rounded-full transition-all duration-300 ${isScrolled ? 'ag-nav-scrolled' : 'ag-nav-top'}`}
        >
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            aria-label="Go to AfroGrad home"
          >
            <img src={logo} alt="AfroGrad" className="h-8 object-contain" />
          </button>

          <div className="hidden items-center gap-1 md:flex"><button onClick={() => navigate('/learning')} className="ag-nav-link">Learning</button><button onClick={() => navigate('/blog')} className="ag-nav-link">Blog</button><button onClick={() => navigate('/pricing')} className="ag-nav-link">Pricing</button><button onClick={() => navigate('/faq')} className="ag-nav-link ag-nav-link-active">FAQ</button></div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/')} className="ag-nav-cta">Back home</button>

            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-surface/80 p-1 shadow-sm transition-colors hover:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="true"
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="h-8 w-8 rounded-full border border-slate-100 object-cover"
                  />
                  <span className="hidden max-w-[120px] truncate px-1 text-sm font-medium text-slate-700 sm:inline-block">
                    {user.name.split(' ')[0]}
                  </span>
                  <ChevronDown
                    className={`mr-1 h-4 w-4 text-slate-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-surface p-2.5 shadow-lg z-50">
                    <div className="mb-1.5 border-b border-slate-100 px-3.5 py-2.5">
                      <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.role}</p>
                    </div>
                    <button
                      onClick={() => { setIsDropdownOpen(false); navigate('/dashboard'); }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4 text-slate-500" />
                      Dashboard
                    </button>
                    {onLogout && (
                      <button
                        onClick={() => { setIsDropdownOpen(false); onLogout(); }}
                        className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button onClick={onLoginClick} className="ag-nav-cta">
                Sign in
              </button>
            )}
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <div className="ag-faq-hero px-4 pb-14 pt-28 sm:px-6 sm:pb-20 sm:pt-36 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="ag-eyebrow">
            Help & Support
          </p>
          <h1 className="ag-display mt-4 text-5xl sm:text-6xl lg:text-7xl">
            Build the ability to think. <span>Not just memorize.</span>
          </h1>
          <p className="ag-lede mt-5 max-w-2xl">
            Answers about personalized learning, teacher tools, problem-solving practice, and AI that supports the learner’s own thinking.
          </p>

          {/* Search — fixed width glass pill */}
          <div className="mt-8 relative w-full sm:w-[380px] max-w-full shrink-0">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#073264]/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setOpenIndex(null); }}
              placeholder="Search questions…"
              aria-label="Search frequently asked questions"
              style={{
                WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                backdropFilter: 'blur(12px) saturate(160%)',
              }}
              className="w-full rounded-full border border-[#073264]/15 bg-white/60 py-3 pl-10 pr-10 text-base sm:text-sm font-medium text-[#073264] placeholder-[#073264]/35 shadow-sm focus:border-[#073264]/40 focus:bg-white/80 focus:outline-none focus:ring-0"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setOpenIndex(null); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#073264]/40 transition-colors hover:text-[#073264]"
                aria-label="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body: Sidebar + Accordion ── */}
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-14">

          {/* Category sidebar */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Categories
              </p>
              {['All', ...CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setOpenIndex(null); }}
                  aria-pressed={activeCategory === cat}
                  style={
                    activeCategory === cat
                      ? { WebkitBackdropFilter: 'blur(12px) saturate(160%)', backdropFilter: 'blur(12px) saturate(160%)' }
                      : { WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }
                  }
                  className={`block w-full rounded-full px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-widest transition-all duration-200 ${
                    activeCategory === cat
                      ? 'bg-[#073264] text-white shadow-sm shadow-[#073264]/20'
                      : 'border border-[#073264]/15 bg-white/50 text-[#073264]/70 hover:bg-white/80 hover:text-[#073264]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </aside>

          {/* Mobile category pills — scrollable, glass pill style */}
          <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none lg:hidden">
            {['All', ...CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setOpenIndex(null); }}
                aria-pressed={activeCategory === cat}
                style={
                  activeCategory === cat
                    ? { WebkitBackdropFilter: 'blur(12px) saturate(160%)', backdropFilter: 'blur(12px) saturate(160%)' }
                    : { WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }
                }
                className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#073264]/30 ${
                  activeCategory === cat
                    ? 'bg-[#073264] text-white shadow-md shadow-[#073264]/20'
                    : 'border border-[#073264]/15 bg-white/50 text-[#073264]/70 hover:bg-white/80 hover:text-[#073264] hover:border-[#073264]/30 hover:shadow-sm'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Accordion groups */}
          <main>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <Search className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-lg font-semibold text-secondary-900">No results found</p>
                <p className="text-sm text-slate-500">
                  Try a different search term or browse by category.
                </p>
              </div>
            ) : (
              <div className="space-y-14">
                {Object.entries(grouped).map(([category, items]) => (
                  <section key={category}>
                    <h2 className="mb-6 text-xs font-bold uppercase tracking-widest text-brand-600 border-b border-slate-200 pb-3">
                      {category}
                    </h2>

                    <div className="divide-y divide-slate-200">
                      {items.map((faq) => {
                        const idx = globalIndex(faq);
                        const isOpen = openIndex === idx;
                        return (
                          <div key={faq.question}>
                            <button
                              onClick={() => setOpenIndex(isOpen ? null : idx)}
                              aria-expanded={isOpen}
                              aria-controls={`faq-answer-${idx}`}
                              className="group flex w-full items-center justify-between gap-6 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
                            >
                              <span
                                className={`text-base font-normal leading-snug transition-colors sm:text-lg ${
                                  isOpen
                                    ? 'text-brand-600'
                                    : 'text-secondary-900 group-hover:text-brand-600'
                                }`}
                              >
                                {faq.question}
                              </span>
                              <span
                                aria-hidden="true"
                                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-base font-light transition-colors duration-200 ${
                                  isOpen
                                    ? 'border-brand-300 bg-brand-50 text-brand-600'
                                    : 'border-slate-300 bg-surface text-slate-500'
                                }`}
                              >
                                {isOpen ? '−' : '+'}
                              </span>
                            </button>

                            <div
                              id={`faq-answer-${idx}`}
                              className={`grid transition-colors duration-300 ease-in-out ${
                                isOpen
                                  ? 'grid-rows-[1fr] opacity-100'
                                  : 'grid-rows-[0fr] opacity-0 overflow-hidden'
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="pb-6 pr-10 text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
                                  {faq.answer}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* ── Contact CTA ── */}
            <div
              style={{
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                backdropFilter: 'blur(16px) saturate(180%)',
              }}
              className="mt-20 rounded-3xl border border-[#073264]/10 bg-white/60 px-8 py-10 shadow-sm sm:px-12 sm:py-14"
            >
              <div className="mx-auto max-w-2xl text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#073264]/8">
                  <MessageSquare className="h-5 w-5 text-[#073264]" />
                </div>
                <h3 className="text-xl font-semibold text-[#073264] sm:text-2xl">
                  Still have questions?
                </h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-500 sm:text-base">
                  Join the waitlist as a learner, or talk with us about bringing curriculum-grounded
                  AI and practical learning to your school or institution.
                </p>
                <button
                  onClick={() => user ? navigate('/dashboard') : onLoginClick()}
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#073264] px-7 py-3 text-sm font-semibold text-white shadow-md shadow-[#073264]/20 transition-all duration-200 hover:bg-[#0a4382] hover:shadow-lg active:scale-[0.98]"
                >
                  {user ? 'Open AI Chat' : 'Join the waitlist'}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="mt-16 border-t border-[#073264]/10 bg-[#f8fafc]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          {/* Top row: logo + tagline */}
          <div className="flex flex-col items-center gap-3 text-center">
            <img src={logo} alt="AfroGrad" className="h-7 w-auto object-contain opacity-80" />
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              Jeli is an AfroGrad product — AI learning built for Africa.
            </p>
          </div>

          {/* Divider */}
          <div className="my-7 border-t border-[#073264]/8" />

          {/* Bottom row: copyright + legal links */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-slate-400">
              &copy; {new Date().getFullYear()} AfroGrad. All rights reserved.
            </p>
            <LegalLinks className="[&_a]:text-xs [&_a]:text-slate-400 [&_a]:hover:text-[#073264]" />
          </div>
        </div>
      </footer>

    </div>
  );
};
