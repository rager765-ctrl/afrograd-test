import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calendar,
  Check,
  Clock,
  Copy,
  Headphones,
  Heart,
  Linkedin,
  Mail,
  MessageSquare,
  Pause,
  Play,
  Search,
  Share2,
  UserPlus,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import logo from '../assets/afrograd-logo.png';
import { blogStorage, BlogPostItem } from '../services/blogStorage';
import { IS_COMPANY_SITE, jeliLink } from '../sites/afrograd/siteLinks';
import { applySeo } from '../services/seo';

/**
 * The blog renders in both builds. In Jeli, app pages are client routes; on the
 * company site they live on another origin, so leave for Jeli instead of
 * falling through to the company site's catch-all redirect.
 */
const openAppPage = (navigate: (path: string) => void, path: string) => {
  if (IS_COMPANY_SITE) window.location.assign(jeliLink(path));
  else navigate(path);
};

// Helper to strip HTML tags for titles and excerpts
const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|#8217|#8220|#8221|#8211|#8216);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Clean content HTML and strip duplicate leading cover image
const processContent = (html: string, coverImageUrl?: string) => {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s(?:on\w+|style)=(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/href=("|')javascript:[\s\S]*?\1/gi, 'href="#"');

  // Strip leading figure / image so cover image never appears twice
  cleaned = cleaned.replace(/^\s*<figure[^>]*>[\s\S]*?<\/figure>\s*/i, '');
  cleaned = cleaned.replace(/^\s*<p[^>]*>\s*<img[^>]+>\s*<\/p>\s*/i, '');
  cleaned = cleaned.replace(/^\s*<img[^>]+>\s*/i, '');

  // If a specific cover image URL is provided, also strip duplicate figure containing that image
  if (coverImageUrl) {
    const rawUrl = coverImageUrl.split('?')[0];
    if (rawUrl.length > 10) {
      const escaped = rawUrl.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const figureRegex = new RegExp(`<figure[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/figure>`, 'gi');
      cleaned = cleaned.replace(figureRegex, '');
      const imgRegex = new RegExp(`<img[^>]+src=["'][^"']*${escaped}[^"']*["'][^>]*>`, 'gi');
      cleaned = cleaned.replace(imgRegex, '');
    }
  }

  // Ensure all h2 and h3 have IDs for Table of Contents navigation
  let headingIndex = 0;
  cleaned = cleaned.replace(/<(h[23])([^>]*)>(.*?)<\/\1>/gi, (match, tag, attrs, text) => {
    headingIndex++;
    if (/id=["'][^"']+["']/i.test(attrs)) {
      return match;
    }
    const slugId =
      stripHtml(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `section-${headingIndex}`;
    return `<${tag}${attrs} id="${slugId}">${text}</${tag}>`;
  });

  return cleaned.trim();
};

export const BlogPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams();

  // Load all blogs dynamically from blogStorage
  const [allBlogs, setAllBlogs] = useState<BlogPostItem[]>(() => blogStorage.getAll());

  useEffect(() => {
    setAllBlogs(blogStorage.getAll());
  }, [slug]);

  // Scroll & reading progress
  const [readingProgress, setReadingProgress] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  // FAB visibility: true only when scrolled down AND scroll has been idle for 400ms
  const [isFabVisible, setIsFabVisible] = useState(false);
  const fabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search and filter (for catalog view)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  // Interactive post state
  const [copiedLink, setCopiedLink] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(24);

  // Audio / Listen mode
  const [showListenPlayer, setShowListenPlayer] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Email subscribe feedback
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  // Resolve active post
  const active = slug ? allBlogs.find((post) => post.slug === slug) : undefined;
  const author = active?.author || {
    name: 'AfroGrad Team',
    role: 'AfroGrad',
    bio: 'Written by the AfroGrad team.',
    avatar: '/afrograd-logo.png',
  };

  // Give each post its own title and description. Deferred one tick because
  // App applies the generic /blog/* SEO in its own effect, which runs after
  // this one when both commit together.
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      applySeo(
        {
          title: `${active.title} | AfroGrad Journal`,
          description: (active.subtitle || active.excerpt || '').slice(0, 160),
        },
        window.location.pathname,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active]);

  // Processed HTML: strips duplicate leading cover image
  const processedHtml = useMemo(() => {
    if (!active) return '';
    return processContent(active.content, active.coverImage);
  }, [active]);

  const readingTimeMinutes = active?.readTimeMinutes || 6;

  // Scroll tracking + FAB idle-pop logic
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsScrolled(scrollY > 15);

      const winHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight - winHeight;
      if (docHeight > 0) {
        const progress = Math.min(100, Math.max(0, (scrollY / docHeight) * 100));
        setReadingProgress(progress);
      }

      // Hide FABs immediately while user is scrolling
      setIsFabVisible(false);
      if (fabTimerRef.current) clearTimeout(fabTimerRef.current);

      // Only schedule pop-in if user has scrolled away from top
      if (scrollY > 60) {
        fabTimerRef.current = setTimeout(() => setIsFabVisible(true), 400);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (fabTimerRef.current) clearTimeout(fabTimerRef.current);
    };
  }, []);

  // Like persistence
  useEffect(() => {
    if (slug) {
      const savedLike = localStorage.getItem(`afrograd_like_${slug}`);
      if (savedLike === 'true') {
        setLiked(true);
        setLikeCount(25);
      } else {
        setLiked(false);
        setLikeCount(24);
      }
    }
  }, [slug]);

  // Speech cleanup
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [slug]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleToggleLike = () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => (nextLiked ? prev + 1 : prev - 1));
    if (slug) {
      localStorage.setItem(`afrograd_like_${slug}`, String(nextLiked));
    }
  };

  const togglePlayAudio = () => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis audio is not supported in this browser.');
      return;
    }

    if (isPlayingAudio) {
      window.speechSynthesis.pause();
      setIsPlayingAudio(false);
    } else {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPlayingAudio(true);
      } else {
        window.speechSynthesis.cancel();
        if (!active) return;
        const textToRead = `${active.title}. By ${author.name}. ${stripHtml(active.content).slice(0, 3000)}`;
        const utterance = new SpeechSynthesisUtterance(textToRead);
        utterance.rate = playbackSpeed;

        utterance.onboundary = (e) => {
          if (textToRead.length > 0) {
            setAudioProgress(Math.min(100, Math.round((e.charIndex / textToRead.length) * 100)));
          }
        };

        utterance.onend = () => {
          setIsPlayingAudio(false);
          setAudioProgress(100);
        };

        utterance.onerror = () => {
          setIsPlayingAudio(false);
        };

        speechUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
        setIsPlayingAudio(true);
      }
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      setTimeout(togglePlayAudio, 100);
    }
  };

  const handleStopAudio = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setShowListenPlayer(false);
    setAudioProgress(0);
  };

  const scrollToNewsletter = () => {
    const el = document.getElementById('newsletter-box');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Filtered stories for catalog view
  const publishedBlogs = useMemo(() => allBlogs.filter((b) => b.status === 'published'), [allBlogs]);

  const filteredPosts = useMemo(() => {
    return publishedBlogs.filter((post) => {
      const titleMatch = post.title.toLowerCase().includes(searchQuery.toLowerCase());
      const contentMatch = post.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSearch = titleMatch || contentMatch;

      if (selectedTag === 'all') return matchesSearch;
      return matchesSearch && post.category.toLowerCase().includes(selectedTag.toLowerCase());
    });
  }, [publishedBlogs, searchQuery, selectedTag]);

  // Lead story for modern catalog layout
  const isDefaultView = selectedTag === 'all' && searchQuery.trim() === '';
  const leadStory = isDefaultView && filteredPosts.length > 0 ? filteredPosts[0] : null;
  const gridStories = isDefaultView && filteredPosts.length > 0 ? filteredPosts.slice(1) : filteredPosts;

  return (
    <div className="ag-static-light ag-home min-h-screen text-[#111111] selection:bg-[#ffedd5] selection:text-[#9a3412] w-full max-w-full overflow-x-hidden">
      {/* ═══════════════════════════════════════════════════════════════════
          Header: Clean modern top bar with sharp architectural geometry
          ═══════════════════════════════════════════════════════════════════ */}
      {/*
        The site nav, not a bespoke masthead. This page previously shipped its
        own centred "AFROGRAD JOURNAL" wordmark and square buttons, which is why
        it read as a different product from every other public page. The pill,
        the link set and the account-free CTAs now match Landing and FAQ; the
        journal voice stays in the article typography below.
      */}
      <header className="fixed left-0 right-0 top-3 z-50 px-3 sm:top-5 sm:px-6">
        <nav
          style={{
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            backdropFilter: 'blur(20px) saturate(180%)',
          }}
          className={`ag-nav mx-auto flex max-w-6xl items-center justify-between gap-4 px-3.5 py-2.5 sm:px-4 rounded-full transition-all duration-300 ${isScrolled ? 'ag-nav-scrolled' : 'ag-nav-top'}`}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              aria-label="Go to AfroGrad home"
            >
              <img src={logo} alt="AfroGrad" className="h-8 w-auto object-contain sm:h-9" />
            </button>
            {slug && (
              <button
                onClick={() => navigate('/blog')}
                className="ag-nav-link gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">All stories</span>
              </button>
            )}
          </div>

          <div className="hidden items-center gap-1 md:flex">
            {IS_COMPANY_SITE ? (
              // Same links as the AfroGrad homepage nav, so the blog reads as part of that site.
              <>
                <a href="/#products" className="ag-nav-link">Products</a>
                <a href="/#work" className="ag-nav-link">Work with us</a>
                <button onClick={() => navigate('/blog')} className="ag-nav-link ag-nav-link-active">Notes</button>
                <a href="/#careers" className="ag-nav-link">Careers</a>
              </>
            ) : (
              <>
                <button onClick={() => openAppPage(navigate, '/learning')} className="ag-nav-link">Learning</button>
                <button onClick={() => navigate('/blog')} className="ag-nav-link ag-nav-link-active">Blog</button>
                <button onClick={() => openAppPage(navigate, '/pricing')} className="ag-nav-link">Pricing</button>
                <button onClick={() => openAppPage(navigate, '/faq')} className="ag-nav-link">FAQ</button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search icon — always visible on mobile */}
            <button
              onClick={() => {
                const searchEl = document.getElementById('catalog-search-input');
                if (searchEl) searchEl.focus();
                else navigate('/blog');
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-white/30 text-[#073264] transition-all hover:bg-white/60"
              aria-label="Search dispatches"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* CTA: visible always on desktop; on mobile fades out when scrolled */}
            <button
              onClick={() => openAppPage(navigate, IS_COMPANY_SITE ? '/' : '/login')}
              className={`ag-nav-cta transition-all duration-300 ${
                isScrolled ? 'opacity-0 pointer-events-none scale-90 w-0 px-0 overflow-hidden' : 'opacity-100 scale-100'
              } md:opacity-100 md:pointer-events-auto md:scale-100 md:w-auto md:px-4`}
              aria-hidden={isScrolled}
            >
              {!IS_COMPANY_SITE && <UserPlus className="h-3.5 w-3.5 shrink-0" />}
              <span className="whitespace-nowrap">{IS_COMPANY_SITE ? 'Try Jeli' : 'Sign up'}</span>
            </button>
          </div>
        </nav>

        {/* Reading progress stays with the nav; it belongs to the article. */}
        {slug && (
          <div className="mx-auto mt-1 h-[2px] max-w-6xl overflow-hidden rounded-pill bg-transparent">
            <div
              className="h-full bg-[#e65100] transition-[width] duration-75 ease-out"
              style={{ width: `${readingProgress}%` }}
              role="progressbar"
            />
          </div>
        )}
      </header>

      {/* ── Floating FABs — mobile only, listing page only ── */}
      {!slug && (
        <div
          className={`fixed bottom-6 right-5 z-40 flex flex-col items-center gap-3 md:hidden transition-all duration-500 ${
            isFabVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          {/* Home FAB */}
          <button
            onClick={() => navigate('/')}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#073264] text-white shadow-lg shadow-[#073264]/30 transition-all duration-200 hover:bg-[#0a4382] hover:shadow-xl active:scale-95"
            aria-label="Back to home"
            title="Back to home"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>

          {/* Subscribe FAB */}
          <button
            onClick={scrollToNewsletter}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e65100] text-white shadow-lg shadow-[#e65100]/30 transition-all duration-200 hover:bg-[#cc4700] hover:shadow-xl active:scale-95"
            aria-label="Subscribe to newsletter"
            title="Subscribe"
          >
            <Mail className="h-5 w-5" />
          </button>
        </div>
      )}


      {/* ═══════════════════════════════════════════════════════════════════
          Sticky Right-Edge Action Bar for Easy Navigation (Sharp Modern Geometry)
          ═══════════════════════════════════════════════════════════════════ */}
      {slug && (
        <aside
          aria-label="Article navigation"
          className="fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-center gap-2 p-2 bg-surface/95 backdrop-blur-md rounded-none border border-slate-300 shadow-xl"
        >
          {/* Subscribe */}
          <button
            onClick={scrollToNewsletter}
            className="group relative flex flex-col items-center justify-center p-2 rounded-none text-slate-700 hover:bg-[#ffedd5] hover:text-[#e65100] transition-colors"
            title="Subscribe to newsletter"
          >
            <Mail className="w-4 h-4 text-[#e65100]" />
            <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Subscribe</span>
          </button>

          {/* Sign Up */}
          <button
            onClick={() => navigate('/login')}
            className="group relative flex flex-col items-center justify-center p-2 rounded-none bg-[#073264] text-white hover:bg-[#0a4382] transition-colors"
            title="Sign Up / Sign In"
          >
            <UserPlus className="w-4 h-4" />
            <span className="text-[9px] font-bold mt-0.5 uppercase tracking-wider">Sign Up</span>
          </button>

          <div className="w-5 h-px bg-slate-200 my-0.5" />

          {/* Listen audio toggle */}
          <button
            onClick={() => {
              setShowListenPlayer((prev) => !prev);
              if (!isPlayingAudio) togglePlayAudio();
            }}
            className={`p-2 rounded-none transition-colors ${
              isPlayingAudio ? 'bg-[#ffedd5] text-[#e65100]' : 'text-slate-600 hover:bg-slate-100 hover:text-black'
            }`}
            title="Listen to this article"
          >
            <Headphones className="w-4 h-4" />
          </button>

          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            className="p-2 rounded-none text-slate-600 hover:bg-slate-100 hover:text-black transition-colors"
            title="Copy link"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Scroll to Top */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="p-2 rounded-none text-slate-500 hover:bg-slate-100 hover:text-black transition-colors"
            title="Scroll to top"
          >
            <ArrowUp className="w-4 h-4" />
          </button>

          {/* All Stories */}
          <button
            onClick={() => navigate('/blog')}
            className="p-2 rounded-none text-slate-500 hover:bg-slate-100 hover:text-black transition-colors"
            title="Back to all stories"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          POST DETAIL VIEW (/blog/:slug)
          Exact Every.to format: Cover Image ON TOP, left caption, 680px body
          ═══════════════════════════════════════════════════════════════════ */}
      {active ? (
        <div className="w-full pb-24">
          {/* 1. Cover Image AT THE TOP (Full bounded hero, crisp edges) */}
          <section className="max-w-[1040px] mx-auto px-4 sm:px-6 pt-24 sm:pt-28">
            <figure className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100 rounded-none border-0 shadow-none">
              <img
                src={active.coverImage}
                alt={active.title}
                className="w-full h-full object-cover rounded-none"
              />
            </figure>
            <figcaption className="text-left text-xs text-slate-500 font-sans mt-2">
              {active.coverCaption || 'AfroGrad editorial illustration.'}
            </figcaption>
          </section>

          {/* 2. Reading Column: Exact 680px Every.to layout */}
          <main className="max-w-[680px] mx-auto px-4 sm:px-0 mt-8 sm:mt-10">
            {/* Eyebrow with small square badge icon */}
            <div className="flex items-center gap-2 mb-3.5">
              <span className="w-3.5 h-3.5 bg-[#e65100] text-white flex items-center justify-center text-[10px] font-bold rounded-none shrink-0">
                {active.category?.charAt(0) || 'A'}
              </span>
              <span className="text-xs font-sans font-semibold uppercase tracking-wider text-slate-900">
                {active.eyebrow || `${active.category} · Field Note`}
              </span>
            </div>

            {/* Headline: High-contrast display serif */}
            <h1 className="font-editorial text-3xl sm:text-4xl md:text-[42px] font-bold tracking-tight text-[#111111] leading-[1.15] mb-4">
              {stripHtml(active.title)}
            </h1>

            {/* Subtitle / Deck */}
            {active.subtitle && (
              <p className="font-reading text-lg sm:text-xl text-[#444444] leading-relaxed mb-6 font-normal">
                {active.subtitle}
              </p>
            )}

            {/* Author Byline */}
            <div className="flex items-center gap-3 mb-2">
              <img
                src={author.avatar}
                alt={author.name}
                className="w-9 h-9 rounded-full object-cover shrink-0"
              />
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-[#111111] font-sans">
                  {author.name}
                </span>
              </div>
            </div>

            {/* Date & Read Time */}
            <div className="text-xs text-slate-500 font-sans mb-4">
              <div>
                <span>
                  {new Date(active.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span> · </span>
                <span>{readingTimeMinutes} min read</span>
              </div>
              <div className="text-slate-400 mt-0.5">
                Updated {new Date(active.modified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            {/* Action Bar */}
            <div
              id="post-meta-bar"
              className="py-3 border-y border-slate-200 flex items-center gap-2 flex-wrap text-xs text-slate-500 font-sans mb-6"
            >
              {/* Listen Pill */}
              <button
                onClick={() => {
                  setShowListenPlayer((prev) => !prev);
                  if (!isPlayingAudio) togglePlayAudio();
                }}
                className={`post-action-button gap-1.5 rounded-none ${
                  isPlayingAudio ? 'bg-slate-100 text-black border-slate-400' : ''
                }`}
                title="Listen to this article"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>{isPlayingAudio ? 'Listening…' : 'Listen'}</span>
              </button>

              {/* Copy Link */}
              <div className="relative">
                <button
                  onClick={handleCopyLink}
                  className="post-action-button post-action-button-icon rounded-none"
                  title="Copy link"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {copiedLink && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] font-medium px-2 py-0.5 rounded-none shadow-sm whitespace-nowrap">
                    Link copied
                  </span>
                )}
              </div>

              {/* Social Sharing */}
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(active.title)}&url=${encodeURIComponent(window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="post-action-button post-action-button-icon rounded-none"
                title="Share on X"
              >
                <span className="font-bold text-xs">𝕏</span>
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="post-action-button post-action-button-icon rounded-none"
                title="Share on LinkedIn"
              >
                <Linkedin className="w-3.5 h-3.5" />
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="post-action-button post-action-button-icon rounded-none"
                title="Share on Facebook"
              >
                <span className="font-bold text-xs">f</span>
              </a>

              <div className="h-3.5 w-px bg-slate-200 mx-0.5" />

              {/* Like Button */}
              <button
                onClick={handleToggleLike}
                className={`post-action-button gap-1.5 rounded-none ${liked ? 'active' : ''}`}
                title="Like"
              >
                <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
                <span className="tabular-nums">{likeCount}</span>
              </button>

              {/* Comments Anchor */}
              <a href="#comments" className="post-action-button gap-1 rounded-none" title="Comments">
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="tabular-nums">4</span>
              </a>
            </div>

            {/* Audio Narration Bar (collapsible) */}
            {showListenPlayer && (
              <div className="my-4 p-3.5 bg-slate-50 border border-slate-200 flex flex-col gap-2 rounded-none">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlayAudio}
                      className="w-8 h-8 rounded-none bg-[#111111] text-white flex items-center justify-center hover:bg-black transition-colors"
                    >
                      {isPlayingAudio ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white translate-x-0.5" />}
                    </button>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Audio Edition</p>
                      <p className="text-[11px] text-slate-500">
                        {isPlayingAudio ? 'Reading aloud' : 'Paused'} · {playbackSpeed}x speed
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {[1, 1.25, 1.5].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSpeedChange(s)}
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-none ${
                          playbackSpeed === s ? 'bg-black text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                    <button onClick={handleStopAudio} className="p-1 text-slate-400 hover:text-slate-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="w-full bg-slate-200 h-1 overflow-hidden">
                  <div className="bg-[#111111] h-full transition-colors duration-300" style={{ width: `${audioProgress}%` }} />
                </div>
              </div>
            )}

            {/* Every.to Forwarding Note */}
            <div className="my-6">
              <p className="font-reading text-sm italic text-slate-600">
                Was this newsletter forwarded to you?{' '}
                <button
                  onClick={scrollToNewsletter}
                  className="underline text-[#111111] hover:text-black font-medium"
                >
                  Sign up
                </button>{' '}
                to get it in your inbox.
              </p>
              <hr className="border-t border-slate-200 mt-5 mb-0" />
            </div>

            {/* Article Prose Body (NO duplicate cover image, exact literary typography) */}
            <article
              className="every-post-body"
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />

            {/* In-Article Newsletter Subscription Box (Modern sharp architectural container) */}
            <section
              id="newsletter-box"
              className="mt-16 p-8 sm:p-10 bg-[#073264] text-white rounded-3xl border border-[#073264] shadow-sm"
            >
              <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-white leading-tight">
                What Comes Next
              </h2>
              <p className="font-reading text-sm sm:text-base text-slate-200 mt-2 leading-relaxed">
                New ideas, tools, and playbooks to help you build the future—in your inbox, every week.
              </p>

              {subscribed ? (
                <div className="mt-5 p-3 bg-surface/10 text-xs text-slate-200 flex items-center gap-2 rounded-2xl">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Thank you for subscribing! Check your inbox for our latest essay.</span>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubscribed(true);
                  }}
                  className="mt-6 flex flex-col sm:flex-row gap-2.5"
                >
                  <input
                    type="email"
                    required
                    placeholder="example@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-surface text-slate-900 placeholder-slate-400 text-sm focus:outline-none rounded-xl"
                  />
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#e65100] hover:bg-[#a83900] text-white font-semibold text-sm transition-colors rounded-xl whitespace-nowrap"
                  >
                    Subscribe
                  </button>
                </form>
              )}
            </section>

            {/* Post Author Box at End of Article */}
            <div className="mt-12 pt-8 border-t border-slate-200 flex items-start gap-4">
              <img
                src={author.avatar}
                alt={author.name}
                className="w-14 h-14 rounded-full object-cover shrink-0"
              />
              <div>
                <h4 className="font-sans font-bold text-sm text-[#111111] uppercase tracking-wider">
                  By {author.name}
                </h4>
                <p className="font-reading text-sm text-slate-600 mt-1.5 leading-relaxed">
                  {author.bio}
                </p>
              </div>
            </div>

            {/* Reader Discussion */}
            <section id="comments" className="mt-14 pt-8 border-t border-slate-200">
              <h3 className="font-editorial text-xl font-bold text-[#111111] mb-5">
                Comments (4)
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-none">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                    <span className="font-bold text-slate-900 font-sans">Abena Osei</span>
                    <span>2 days ago</span>
                  </div>
                  <p className="font-reading text-sm text-slate-700 leading-relaxed">
                    Cold emailing professors using structured research alignment worked wonders for my MSc application at McGill. Great note on having a ready portfolio before sending outreach.
                  </p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-none">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                    <span className="font-bold text-slate-900 font-sans">Emmanuel N.</span>
                    <span>3 days ago</span>
                  </div>
                  <p className="font-reading text-sm text-slate-700 leading-relaxed">
                    The reminder about early fee waivers is crucial. Many departments deplete their international waiver pools by October.
                  </p>
                </div>
              </div>
            </section>
          </main>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════
            CATALOG / INDEX VIEW (/blog)
            Modern Architectural Editorial Layout: Sharp flat geometry (no rounded cards)
            ═══════════════════════════════════════════════════════════════════ */
        <main className="max-w-[1140px] mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-28">
          {/* Masthead */}
          <div className="border-b border-slate-200 pb-8">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-[#e65100]" />
              <span className="text-xs font-bold uppercase tracking-widest text-[#e65100]">
                AFROGRAD JOURNAL · FIELD NOTES &amp; ESSAYS
              </span>
            </div>
            <h1 className="font-editorial text-3xl sm:text-5xl font-bold tracking-tight text-[#111111] mt-2 leading-[1.12]">
              Ideas, frameworks, and playbooks for African learning.
            </h1>
            <p className="font-reading text-base sm:text-lg text-slate-600 mt-3 leading-relaxed max-w-2xl">
              Curated field notes for students, researchers, and builders navigating competitive education pathways in the age of AI.
            </p>

            {/* Filter & Search Bar — Liquid Glass Pill Design */}
            <div className="mt-8 border-t border-[#073264]/10 pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                {/* Category Pills — scrollable on mobile, wrap on larger screens */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap scrollbar-none">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'admissions', label: 'Admissions' },
                    { id: 'personal statements', label: 'Personal Statements' },
                    { id: 'planning', label: 'Planning' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => setSelectedTag(id)}
                      style={
                        selectedTag === id
                          ? {
                              WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                              backdropFilter: 'blur(12px) saturate(160%)',
                            }
                          : {
                              WebkitBackdropFilter: 'blur(8px)',
                              backdropFilter: 'blur(8px)',
                            }
                      }
                      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#073264]/30 ${
                        selectedTag === id
                          ? 'bg-[#073264] text-white shadow-md shadow-[#073264]/20'
                          : 'border border-[#073264]/15 bg-white/50 text-[#073264]/70 hover:bg-white/80 hover:text-[#073264] hover:border-[#073264]/30 hover:shadow-sm'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Search — fixed width glass pill */}
                <div className="relative w-full sm:w-72 shrink-0">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#073264]/40" />
                  <input
                    id="catalog-search-input"
                    type="text"
                    placeholder="Search dispatches…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      WebkitBackdropFilter: 'blur(12px) saturate(160%)',
                      backdropFilter: 'blur(12px) saturate(160%)',
                    }}
                    className="w-full rounded-full border border-[#073264]/15 bg-white/60 py-2.5 pl-9 pr-4 text-base sm:text-xs font-medium text-[#073264] placeholder-[#073264]/35 shadow-sm focus:border-[#073264]/40 focus:bg-white/80 focus:outline-none focus:ring-0"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#073264]/40 transition-colors hover:text-[#073264]"
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
          </div>

          {/* ═══ Featured Lead Story (Top of /blog) ═══ */}
          {leadStory && (
            <div className="mt-10 mb-14 border-b border-slate-200 pb-12">
              <button
                onClick={() => navigate(`/blog/${leadStory.slug}`)}
                className="group w-full text-left grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
              >
                {/* Left: Large 16:9 sharp hero image */}
                <div className="lg:col-span-7">
                  <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100 border border-slate-200/80 rounded-none">
                    <img
                      src={leadStory.coverImage}
                      alt=""
                      className="w-full h-full object-cover] transition-transform duration-500 rounded-none"
                    />
                  </div>
                </div>

                {/* Right: Editorial Typography */}
                <div className="lg:col-span-5 flex flex-col justify-between py-1">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 bg-[#e65100]" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-[#e65100]">
                        {leadStory.eyebrow || 'Featured Field Note'}
                      </span>
                    </div>

                    <h2 className="font-editorial text-2xl sm:text-3xl lg:text-[34px] font-bold tracking-tight text-[#111111] group-hover:text-[#073264] transition-colors leading-[1.18]">
                      {stripHtml(leadStory.title)}
                    </h2>

                    <p className="font-reading text-sm sm:text-base text-slate-600 mt-3.5 leading-relaxed line-clamp-3">
                      {leadStory.subtitle || leadStory.excerpt}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-sans">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={leadStory.author.avatar}
                        alt=""
                        className="w-6 h-6 rounded-full object-cover"
                      />
                      <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px]">
                        {leadStory.author.name}
                      </span>
                      <span>·</span>
                      <span>
                        {new Date(leadStory.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <span className="font-semibold text-black flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Read story <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ═══ Modern Grid of Stories (Sharp flat geometry) ═══ */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {gridStories.map((post) => (
              <button
                key={post.id}
                onClick={() => navigate(`/blog/${post.slug}`)}
                className="text-left group flex flex-col justify-between border-b border-slate-200 pb-6 rounded-none bg-transparent hover:bg-transparent"
              >
                <div>
                  <div className="aspect-[16/10] w-full overflow-hidden bg-slate-100 border border-slate-200/80 rounded-none mb-3.5">
                    <img
                      src={post.coverImage}
                      alt=""
                      className="w-full h-full object-cover] transition-transform duration-500 rounded-none"
                    />
                  </div>
                  <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#e65100]">
                    {post.eyebrow}
                  </span>
                  <h3 className="font-editorial text-lg sm:text-xl font-bold text-[#111111] group-hover:text-[#073264] transition-colors mt-1.5 leading-snug line-clamp-2">
                    {stripHtml(post.title)}
                  </h3>
                  <p className="font-reading text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                    {post.subtitle || post.excerpt}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-sans">
                  <span>
                    {new Date(post.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="font-semibold text-black flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Read story <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>

          {filteredPosts.length === 0 && (
            <div className="py-20 text-center text-slate-500 text-xs">
              No stories match your search.
            </div>
          )}

          {/* ═══ Modern Architectural Newsletter Section ═══ */}
          <section
            id="newsletter-box"
            className="mt-20 p-8 sm:p-12 bg-[#073264] text-white rounded-3xl border-0 shadow-sm"
          >
            <div className="max-w-2xl mx-auto text-center">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#ffc18d]">
                AfroGrad Weekly
              </span>
              <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-white mt-2 leading-tight">
                Ideas for African learning in the age of AI.
              </h2>
              <p className="font-reading text-sm sm:text-base text-slate-200 mt-2 leading-relaxed">
                Curated field notes, admissions playbooks, and funding teardowns delivered to your inbox every Thursday.
              </p>

              {subscribed ? (
                <div className="mt-6 p-3 bg-surface/10 text-xs text-slate-200 inline-flex items-center gap-2 rounded-2xl">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>You're on the list. Check your inbox for our latest dispatch.</span>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSubscribed(true);
                  }}
                  className="mt-6 flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
                >
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-surface text-slate-900 placeholder-slate-400 text-xs focus:outline-none rounded-xl"
                  />
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#e65100] hover:bg-[#a83900] text-white font-semibold text-xs transition-colors rounded-xl whitespace-nowrap"
                  >
                    Subscribe
                  </button>
                </form>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
};
