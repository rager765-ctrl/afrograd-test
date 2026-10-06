import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, LogOut } from 'lucide-react';
import logo from '../assets/afrograd-logo.png';
import type { UserProfile } from '../types';
import { Paywall } from './Paywall';

/**
 * /pricing.
 *
 * The plans themselves live in services/billing.ts and are rendered by Paywall,
 * which also appears over the app when the daily message budget runs out. One
 * source of truth means the two surfaces cannot quote different prices.
 */

export interface PricingPageProps {
  user?: UserProfile | null;
  onLoginClick?: () => void;
  onLogout?: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ user, onLoginClick, onLogout }) => {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="ag-static-light ag-home min-h-screen font-sans text-secondary-900">
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
            className="flex items-center gap-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            aria-label="Go to Jeli home"
          >
            <img src={logo} alt="Jeli" className="h-8 w-auto object-contain sm:h-9" />
          </button>

          <div className="hidden items-center gap-1 md:flex">
            <button onClick={() => navigate('/learning')} className="ag-nav-link">Learning</button>
            <button onClick={() => navigate('/blog')} className="ag-nav-link">Blog</button>
            <button onClick={() => navigate('/pricing')} className="ag-nav-link ag-nav-link-active">Pricing</button>
            <button onClick={() => navigate('/faq')} className="ag-nav-link">FAQ</button>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isDropdownOpen}
                  className="ag-account-button"
                >
                  <span className="grid size-7 place-items-center rounded-pill bg-brand-500 text-xs font-bold text-white">
                    {(user.name || 'A').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[120px] truncate px-1 text-sm font-medium sm:inline-block">{user.name}</span>
                </button>
                {isDropdownOpen && (
                  <div className="ag-menu absolute right-0 mt-3 w-56 p-2.5" role="menu">
                    <button onClick={() => { setIsDropdownOpen(false); navigate('/dashboard'); }} className="ag-menu-item">
                      <LayoutDashboard className="h-4 w-4" />Dashboard
                    </button>
                    {onLogout && (
                      <button onClick={() => { setIsDropdownOpen(false); onLogout(); }} className="ag-menu-item ag-menu-item-danger">
                        <LogOut className="h-4 w-4" />Sign out
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button onClick={onLoginClick} className="ag-nav-cta">Start learning</button>
            )}
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-28 text-center sm:px-6 sm:pt-36">
        <h1 className="ag-display text-4xl sm:text-5xl lg:text-6xl">Pricing</h1>
      </section>

      <Paywall
        user={user}
        onLoginClick={onLoginClick}
        onContinueFree={() => (user ? navigate('/dashboard') : onLoginClick?.())}
      />

      <div className="h-20" />
    </div>
  );
};
