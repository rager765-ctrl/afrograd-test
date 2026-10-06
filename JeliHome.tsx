import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Heart,
  LayoutDashboard,
  MapPin,
  Menu,
  Smartphone,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import logo from '../assets/afrograd-logo.png';
import { useReducedMotion } from '../hooks/useMotion';
import { UserProfile } from '../types';
import { AFROGRAD_URL, contactLink } from '../sites/afrograd/siteLinks';

/**
 * Jeli's homepage: the learning platform, said plainly.
 *
 * Jeli is an AfroGrad product. The company story (studio, consulting,
 * careers) lives on the AfroGrad site; this page only speaks to learners.
 * Layout borrows from the templates the user liked: product beside the
 * headline, one light row for the constraints, a photo band and a short FAQ.
 */

interface JeliHomeProps {
  user: UserProfile | null;
  onLoginClick: () => void;
}

// Images are local WebP (public/images/web).
const pillars = [
  {
    name: 'Build a career',
    text: 'Not sure what to do next? A career coach helps you find a direction, map the skills it needs and plan the projects that prove them.',
    label: 'Talk to the coach',
    path: '/login',
    image: '/images/web/collaborative_team_meeting_around_laptop-1200.webp',
    srcSet: '/images/web/collaborative_team_meeting_around_laptop-800.webp 800w, /images/web/collaborative_team_meeting_around_laptop-1200.webp 1200w',
    alt: 'Young people planning next steps together around a laptop',
    fit: 'object-center',
  },
  {
    name: 'Get into grad school',
    text: 'Plan your applications and draft a Statement of Purpose that tells your story, with feedback before you send it.',
    label: 'Start preparing',
    path: '/login',
    image: '/images/web/writing-application-1200.webp',
    srcSet: '/images/web/writing-application-800.webp 800w, /images/web/writing-application-1200.webp 1200w',
    alt: 'A hand writing on an application form',
    fit: 'object-center',
  },
];

// The constraints Jeli is designed around: concise, high-impact cards.
const constraints = [
  { term: 'Low Data Usage', detail: 'Lightweight & bandwidth-friendly.', icon: Wifi },
  { term: 'Mobile First', detail: 'Optimized for shared phones & tablets.', icon: Smartphone },
  { term: 'Classroom Scale', detail: 'Instant feedback for large groups.', icon: Users },
  { term: 'Local Context', detail: 'Rooted in real African examples.', icon: MapPin },
];

const faqs = [
  {
    q: 'How is Jeli different from ChatGPT?',
    a: "ChatGPT is built to answer. Jeli is built to teach: it asks questions, gives hints and checks your understanding, so you do the thinking. Courses, career coaching and grad school support live in one place, with examples from African life.",
  },
  {
    q: 'Who is Jeli for?',
    a: 'Students in school and university, graduates working out their next step, and anyone preparing applications for graduate school.',
  },
  {
    q: 'Can I use Jeli now?',
    a: "Yes. Create an account and start learning. Jeli is still early, so expect it to change, and tell us what works and what doesn't.",
  },
  {
    q: 'Does it work on a phone?',
    a: 'Yes. Jeli runs in the browser on phones and computers, with nothing to install.',
  },
];

// The hero carousel. Local WebP, and it holds still under reduced motion.
const heroScenes = [
  {
    name: 'collaborative_study_in_a_sunlit_learning_space',
    title: 'Collaborative Study',
    subtitle: 'Campus study circles · Accra & Nairobi',
  },
  {
    name: 'collaborative_team_meeting_around_laptop',
    title: 'Builder Sprints',
    subtitle: 'Product & AI hackathons · Lagos & Kigali',
  },
  {
    name: 'collaborative_office_meeting',
    title: '1:1 Mentorship',
    subtitle: 'Executive & alumni advisory sessions',
  },
  {
    name: 'collaborative_workspace_learning_session',
    title: 'Inclusive Learning Labs',
    subtitle: 'Practical problem solving & code review',
  },
];

export const JeliHome: React.FC<JeliHomeProps> = ({ user, onLoginClick }) => {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scene, setScene] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => setScene((current) => (current + 1) % heroScenes.length), 6000);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (path: string) => {
    setMenuOpen(false);
    if (path === '/login' && !user) {
      onLoginClick();
      return;
    }
    navigate(path === '/login' && user ? '/dashboard' : path);
    window.scrollTo(0, 0);
  };

  const primaryLabel = user ? 'Go to dashboard' : 'Start learning';
  const primaryAction = () => (user ? go('/dashboard') : onLoginClick());

  const navLinks = (
    <>
      <button type="button" onClick={() => go('/learning')} className="ag-nav-link">Courses</button>
      <a href="#faq" onClick={() => setMenuOpen(false)} className="ag-nav-link">FAQ</a>
      <a href={AFROGRAD_URL} className="ag-nav-link !bg-[#eef2f6] hover:!bg-[#e2e8f0] !text-[#073264]">About AfroGrad</a>
    </>
  );

  return (
    <div className="ag-static-light ag-home min-h-screen overflow-x-hidden font-sans">
      <header className="fixed left-0 right-0 top-3 z-50 px-3 sm:top-5 sm:px-6">
        <nav
          aria-label="Main"
          style={{
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            backdropFilter: 'blur(20px) saturate(180%)',
          }}
          className={`ag-nav mx-auto flex max-w-6xl items-center justify-between gap-4 px-3.5 py-2.5 sm:px-4 rounded-full transition-all duration-300 ${isScrolled ? 'ag-nav-scrolled' : 'ag-nav-top'}`}
        >
          <button
            type="button"
            onClick={() => go('/')}
            className="flex items-center gap-2.5 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            aria-label="Jeli home"
          >
            <img src={logo} alt="" className="h-8 w-auto object-contain sm:h-9" />
            <span className="font-editorial text-xl font-semibold text-[#073264]">Jeli</span>
          </button>
          <div className="hidden items-center gap-1 md:flex">{navLinks}</div>
          <div className="flex items-center gap-2">
            {/* The wrapper does the hiding: .ag-nav-link and .ag-nav-cta set their
                own display, which overrides a `hidden` class on the buttons. */}
            <div className="hidden items-center gap-2 sm:flex">
              {user ? (
                <button type="button" onClick={() => go('/dashboard')} className="ag-nav-cta">
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  Dashboard
                </button>
              ) : (
                <>
                  <button type="button" onClick={onLoginClick} className="ag-nav-link">Sign in</button>
                  <button type="button" onClick={onLoginClick} className="ag-nav-cta">Start learning</button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="ag-menu-toggle md:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>
        {menuOpen && (
          <div
            style={{
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              backdropFilter: 'blur(24px) saturate(180%)',
            }}
            className="ag-menu mx-auto mt-2.5 flex max-w-6xl flex-col gap-1.5 rounded-3xl p-3.5 shadow-2xl md:hidden animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {navLinks}
            <button type="button" onClick={primaryAction} className="ag-nav-cta mt-2 justify-center">{primaryLabel}</button>
          </div>
        )}
      </header>

      <main>
        {/* Centred hero, matching the live site: kicker, display headline, lede,
            two actions, then the wide photo board. */}
        <section className="ag-hero mx-auto flex max-w-7xl flex-col gap-10 px-4 pb-16 pt-32 sm:px-6 sm:pt-40 lg:px-8">
          <div className="startup-reveal ag-hero-copy mx-auto max-w-3xl text-center">
            <div className="ag-kicker mx-auto mb-5"><span className="ag-kicker-dot" />From basic school to university</div>
            <h1 className="ag-display text-4xl leading-[1.04] sm:text-[2.75rem] lg:text-5xl">
              Learn for mastery. <span>Build for life.</span>
            </h1>
            <p className="ag-lede mx-auto mt-6 max-w-2xl">
              Jeli brings personalized, curriculum-grounded learning to students across Africa. AI supports the process; the learner does the thinking.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button type="button" onClick={primaryAction} className="ag-control-button ag-control-button-lg ag-button ag-button-coral">
                {primaryLabel}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => go('/learning')} className="ag-control-button ag-control-button-lg ag-button ag-button-quiet">
                Browse courses
              </button>
            </div>
          </div>

          <div className="ag-hero-board startup-reveal startup-reveal-delay mx-auto w-full">
            <div className="ag-photo-panel ag-photo-panel-hero">
              <img
                src={`/images/web/${heroScenes[scene].name}-1200.webp`}
                srcSet={`/images/web/${heroScenes[scene].name}-800.webp 800w, /images/web/${heroScenes[scene].name}-1200.webp 1200w`}
                sizes="(min-width: 1280px) 1120px, 100vw"
                width={1200}
                height={800}
                alt={`Learners in an AfroGrad community: ${heroScenes[scene].title}`}
                className="transition-opacity duration-500"
              />
              <div className="ag-photo-note">
                <span>{heroScenes[scene].title} — {heroScenes[scene].subtitle}</span>
                <div className="flex items-center gap-1">
                  {heroScenes.map((item, index) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setScene(index)}
                      aria-label={`Show ${item.title}`}
                      aria-pressed={scene === index}
                      className={`h-1.5 rounded-[1px] transition-colors ${scene === index ? 'w-5 bg-white' : 'w-2 bg-white/40 hover:bg-white/75'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="why-jeli" className="bg-[#f6f8fb] py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="why-jeli" className="font-editorial text-2xl sm:text-3xl lg:text-4xl font-semibold text-[#073264]">
                Built for African Classrooms
              </h2>
              <p className="mt-3 text-sm sm:text-base leading-relaxed text-[#496176]">
                Most AI tools assume high-speed internet and personal laptops. Jeli is engineered specifically for the real-world conditions African students learn in.
              </p>
            </div>
            <div className="mt-8 sm:mt-10 grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {constraints.map(({ term, detail, icon: Icon }) => (
                <div
                  key={term}
                  className="flex flex-col justify-between rounded-2xl border border-[#073264]/10 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-[#e65100]/30"
                >
                  <div>
                    <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1e8] text-[#e65100]">
                      <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold text-base text-[#073264]">{term}</h3>
                    <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[#496176]">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="what-jeli-does" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 id="what-jeli-does" className="font-editorial text-3xl font-semibold text-[#073264] sm:text-4xl text-center">One coach, personalized guidance</h2>
          <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-8 max-w-4xl mx-auto">
            {pillars.map((pillar) => (
              <div key={pillar.name}>
                <div className="overflow-hidden rounded-[14px] border border-[#073264]/12 bg-[#f6f8fb]">
                  <img
                    src={pillar.image}
                    srcSet={pillar.srcSet}
                    sizes="(min-width: 768px) 360px, 100vw"
                    alt={pillar.alt}
                    loading="lazy"
                    decoding="async"
                    className={`aspect-[4/3] w-full object-cover ${pillar.fit}`}
                  />
                </div>
                <h3 className="mt-6 font-editorial text-2xl font-semibold text-[#073264]">{pillar.name}</h3>
                <p className="mt-3 max-w-[38ch] text-base leading-7 text-[#496176]">{pillar.text}</p>
                <button
                  type="button"
                  onClick={() => go(pillar.path)}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#e65100] hover:text-[#073264]"
                >
                  {pillar.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="pilot-heading" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[20px] bg-[#073264] shadow-xl">
            {/* Desktop Full Background Image */}
            <img
              src="/images/web/collaborative_study_in_a_sunlit_learning_space-1200.webp"
              srcSet="/images/web/collaborative_study_in_a_sunlit_learning_space-800.webp 800w, /images/web/collaborative_study_in_a_sunlit_learning_space-1200.webp 1200w"
              sizes="(min-width: 1024px) 1150px, 100vw"
              width={1200}
              height={800}
              loading="lazy"
              decoding="async"
              alt="Students studying together in a bright learning space"
              className="hidden lg:block absolute inset-0 h-full w-full object-cover object-right pointer-events-none"
            />
            {/* Dark gradient fade over left side of desktop background image */}
            <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-[#073264] via-[#073264]/95 to-transparent/40 pointer-events-none" />

            {/* Content Container (Card text on mobile, overlaid over left of image on desktop) */}
            <div className="relative z-10 p-7 sm:p-10 lg:p-14 lg:max-w-xl">
              <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-[#ffb27a]">For schools</p>
              <h2 id="pilot-heading" className="mt-2 font-editorial text-2xl sm:text-3xl lg:text-4xl font-semibold text-white [text-wrap:balance]">
                Bringing Jeli to your school?
              </h2>
              <p className="mt-3.5 text-sm sm:text-base leading-relaxed text-[#c9d6e3]">
                We're piloting Jeli with a small number of schools and learning from every class. If you run a school or teach one, tell us about your learners.
              </p>
              <a
                href={contactLink('Bringing Jeli to our school')}
                className="ag-control-button ag-control-button-lg ag-button ag-button-coral mt-7 inline-flex items-center gap-2"
              >
                Talk to us
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-heading" className="mx-auto max-w-3xl scroll-mt-28 px-4 pb-24 sm:px-6 lg:px-8">
          <h2 id="faq-heading" className="font-editorial text-3xl font-semibold text-[#073264]">FAQs</h2>
          <div className="mt-6 divide-y divide-[#073264]/12 border-y border-[#073264]/12">
            {faqs.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#073264] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden="true" className="text-xl leading-none text-[#e65100] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-base leading-7 text-[#496176]">{item.a}</p>
              </details>
            ))}
          </div>
          <button type="button" onClick={() => go('/faq')} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#e65100] hover:text-[#073264]">
            More questions
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </section>
      </main>

      <footer className="ag-footer border-t border-[#073264]/10 bg-[#f8fafc] py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center text-center px-4 gap-5">

          {/* 1. Logo (Centered) */}
          <div className="flex items-center justify-center">
            <img src={logo} alt="AfroGrad logo" className="h-8 w-auto object-contain" />
          </div>

          {/* 2. Quick Links (Centered) */}
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2.5 text-sm font-medium">
              <li>
                <button type="button" onClick={() => go('/faq')} className="text-[#496176] hover:text-[#e65100] transition-colors">FAQ</button>
              </li>
              <li>
                <a href={AFROGRAD_URL} className="inline-flex items-center gap-1 text-[#496176] hover:text-[#e65100] transition-colors">
                  AfroGrad
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a href={`${AFROGRAD_URL}/#work`} className="text-[#496176] hover:text-[#e65100] transition-colors">Work with us</a>
              </li>
              <li>
                <a href={`${AFROGRAD_URL}/#careers`} className="text-[#496176] hover:text-[#e65100] transition-colors">Careers</a>
              </li>
              <li>
                <button type="button" onClick={() => go('/privacy')} className="text-[#496176] hover:text-[#e65100] transition-colors">Privacy</button>
              </li>
              <li>
                <button type="button" onClick={() => go('/terms')} className="text-[#496176] hover:text-[#e65100] transition-colors">Terms</button>
              </li>
            </ul>
          </nav>

          {/* 3. Copyright Text (Centered) */}
          <p className="text-xs text-[#6f7b89]">
            © {new Date().getFullYear()} AfroGrad. Jeli is an AfroGrad product.
          </p>

          {/* 4. Made with Heart SVG */}
          <p className="flex items-center justify-center gap-1.5 text-xs text-[#6f7b89] font-medium">
            <span>Made with</span>
            <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500 animate-pulse" aria-hidden="true" />
            <span>for scholars across Africa</span>
          </p>

        </div>
      </footer>
    </div>
  );
};
