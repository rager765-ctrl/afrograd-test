import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import logo from '../assets/afrograd-logo.png';
import { UserProfile } from '../types';
import { AFROGRAD_URL } from '../sites/afrograd/siteLinks';

/**
 * The one header for Jeli's public pages (home, catalog pages, pricing, FAQ,
 * legal). Every page used to carry its own copy with different links, so the
 * header changed as people moved around. The blog lives on afrograd.com; its
 * link is marked with an arrow because it leaves Jeli.
 */

export type JeliNavKey = 'learning' | 'events' | 'pricing' | 'faq';

interface JeliHeaderProps {
  user?: UserProfile | null;
  onLoginClick?: () => void;
  onLogout?: () => void;
  active?: JeliNavKey;
  /** The home page overlays its hero, so its header is fixed; others stick. */
  position?: 'fixed' | 'sticky';
}

const links: { key: JeliNavKey; label: string; path: string }[] = [
  { key: 'learning', label: 'Courses', path: '/learning' },
  { key: 'events', label: 'Events', path: '/events' },
  { key: 'pricing', label: 'Pricing', path: '/pricing' },
  { key: 'faq', label: 'FAQ', path: '/faq' },
];

export const JeliHeader: React.FC<JeliHeaderProps> = ({ user, onLoginClick, onLogout, active, position = 'sticky' }) => {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 8);
      // design.md: a subtle scroll progress line beneath the nav. Written to the
      // DOM directly so scrolling doesn't re-render the page.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // design.md: the mobile menu prevents background scrolling while open.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const go = (path: string) => (event?: React.MouseEvent) => {
    event?.preventDefault();
    setMenuOpen(false);
    setAccountOpen(false);
    navigate(path);
    window.scrollTo(0, 0);
  };

  const signIn = () => {
    setMenuOpen(false);
    if (onLoginClick) onLoginClick();
    else navigate('/login');
  };

  const navLinks = (
    <>
      {links.map((link) => (
        <a
          key={link.key}
          href={link.path}
          onClick={go(link.path)}
          className={`ag-nav-link ${active === link.key ? 'ag-nav-link-active' : ''}`}
          aria-current={active === link.key ? 'page' : undefined}
        >
          {link.label}
        </a>
      ))}
      <a href={`${AFROGRAD_URL}/blog`} className="ag-nav-link gap-1">
        Blog
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">(on afrograd.com)</span>
      </a>
    </>
  );

  return (
    <header className={`${position === 'fixed' ? 'fixed left-0 right-0' : 'sticky'} top-3 z-50 px-3 sm:top-5 sm:px-6`}>
      <nav
        aria-label="Main"
        className={`ag-nav mx-auto flex max-w-6xl items-center justify-between gap-4 px-3 py-2 sm:px-4 ${isScrolled ? 'ag-nav-scrolled' : 'ag-nav-top'}`}
      >
        <a
          href="/"
          onClick={go('/')}
          className="flex items-center gap-2.5 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
          aria-label="Jeli home"
        >
          <img src={logo} alt="" className="h-8 w-auto object-contain sm:h-9" />
          <span className="font-editorial text-xl font-semibold text-[#073264]">Jeli</span>
        </a>

        <div className="hidden items-center gap-1 md:flex">{navLinks}</div>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                className="ag-account-button"
              >
                <span className="grid size-7 place-items-center rounded-pill bg-brand-500 text-xs font-bold text-white">
                  {(user.name || 'A').slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[120px] truncate px-1 text-sm font-medium sm:inline-block">{user.name}</span>
              </button>
              {accountOpen && (
                <div className="ag-menu absolute right-0 mt-3 w-56 p-2.5" role="menu">
                  <button type="button" role="menuitem" onClick={go('/dashboard')} className="ag-menu-item">
                    <LayoutDashboard className="h-4 w-4" />Dashboard
                  </button>
                  {onLogout && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setAccountOpen(false); onLogout(); }}
                      className="ag-menu-item ag-menu-item-danger"
                    >
                      <LogOut className="h-4 w-4" />Sign out
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            // The wrapper does the hiding: .ag-nav-link and .ag-nav-cta set their
            // own display, which overrides a `hidden` class on the buttons.
            <div className="hidden items-center gap-2 sm:flex">
              <button type="button" onClick={signIn} className="ag-nav-link">Sign in</button>
              <button type="button" onClick={signIn} className="ag-nav-cta">Start learning</button>
            </div>
          )}
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
        <div className="ag-nav-progress" aria-hidden="true">
          <div ref={progressRef} className="ag-nav-progress-bar" />
        </div>
      </nav>
      {menuOpen && (
        <div className="ag-menu mx-auto mt-3 flex max-w-6xl flex-col gap-1 p-3 md:hidden">
          {navLinks}
          {!user && (
            <button type="button" onClick={signIn} className="ag-nav-cta mt-2 justify-center">Start learning</button>
          )}
        </div>
      )}
    </header>
  );
};
