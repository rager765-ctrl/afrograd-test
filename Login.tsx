import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, CheckCircle, GraduationCap, Users,
  Eye, EyeOff, Mail, Lock, User, Briefcase, Link2, FileText, ChevronDown, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../services/supabase';

interface LoginProps {
  onNavigateHome: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';
type AccountType = 'member' | 'mentor';

/* ── shared input styles ─────────────────────────────────────────── */
const INPUT_BASE =
  'w-full border border-[#dde3ec] bg-[#f5f7fa] py-4 text-sm font-medium text-[#0f172a] placeholder:text-[#aab4c4] outline-none transition-all duration-150 focus:border-[#e65100] focus:ring-[3px] focus:ring-[#e65100]/10 focus:bg-white';

const PillInput = ({
  id, type = 'text', placeholder, value, onChange,
  required, autoComplete, minLength, icon: Icon, rightSlot,
}: {
  id: string; type?: string; placeholder: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean; autoComplete?: string; minLength?: number;
  icon?: React.ElementType; rightSlot?: React.ReactNode;
}) => (
  <div className="relative flex items-center">
    {Icon && <Icon className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-[#aab4c4]" />}
    <input
      id={id} type={type} placeholder={placeholder} value={value}
      onChange={onChange} required={required}
      autoComplete={autoComplete} minLength={minLength}
      style={{ borderRadius: '15px' }}
      className={`${INPUT_BASE} ${Icon ? 'pl-12 pr-12' : 'px-5'}`}
    />
    {rightSlot && <div className="absolute right-4">{rightSlot}</div>}
  </div>
);

export const Login: React.FC<LoginProps> = ({ onNavigateHome }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [accountType, setAccountType] = useState<AccountType>('member');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [fullName, setFullName] = useState('');
  const [professionalTitle, setProfessionalTitle] = useState('');
  const [company, setCompany] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [mentorFocus, setMentorFocus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const formScrollRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 8);
  }, []);

  /* ── profile builder ───────────────────────────────── */
  const buildProfilePayload = (userId: string) => {
    const trimmedName = fullName.trim();
    const trimmedTitle = professionalTitle.trim();
    const isMentor = accountType === 'mentor';
    return {
      id: userId,
      name: trimmedName,
      role: isMentor ? trimmedTitle || 'Mentor' : 'Member',
      account_type: accountType,
      company: isMentor ? company.trim() || 'Independent Mentor' : 'AfroGrad Connect',
      location: 'Not specified',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(trimmedName || email)}&background=e65100&color=fff`,
      skills: [],
      bio: isMentor ? mentorFocus.trim() || 'Available to mentor AfroGrad members.' : 'New AfroGrad member.',
      linkedin_url: isMentor ? linkedinUrl.trim() : '',
    };
  };

  /* ── submit ────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true); setError(null); setSuccess(null);
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setSuccess('Password reset email sent. Check your inbox and spam folder.');
        setIsLoading(false);
      } else if (mode === 'signup') {
        const trimmedName = fullName.trim();
        const trimmedTitle = professionalTitle.trim();
        const isMentor = accountType === 'mentor';
        const { data, error: signUpError } = await supabase.auth.signUp({
          email, password,
          options: {
            data: {
              full_name: trimmedName, account_type: accountType,
              role: isMentor ? trimmedTitle || 'Mentor' : 'Member',
              company: isMentor ? company.trim() || 'Independent Mentor' : 'AfroGrad Connect',
              linkedin_url: isMentor ? linkedinUrl.trim() : '',
              bio: isMentor ? mentorFocus.trim() : 'New AfroGrad member.',
            },
            emailRedirectTo: `${window.location.origin}`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.user) await supabase.from('profiles').upsert(buildProfilePayload(data.user.id), { onConflict: 'id' });
        if (data.session) {
          setTimeout(() => setIsLoading(false), 5000);
        } else {
          const label = isMentor ? 'mentor profile' : 'member account';
          setSuccess(`Your ${label} was created. We sent a confirmation email to ${email}. Confirm it, then sign in.`);
          setIsLoading(false);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        setTimeout(() => setIsLoading(false), 5000);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode); setError(null); setSuccess(null);
    setScrolled(false);
    setTimeout(() => formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const isMentor = accountType === 'mentor';

  /* ── heading copy ──────────────────────────────────── */
  const heading = mode === 'forgot' ? 'Reset password' : mode === 'signup' ? 'Create account' : 'Welcome back';
  const subheading =
    mode === 'forgot' ? "Enter your email and we'll send a reset link."
    : mode === 'signup' ? 'Join the AfroGrad community today.'
    : 'Sign in to your AfroGrad account.';

  /* ── field tracker ─────────────────────────────────── */
  type TrackerField = { label: string; done: boolean };
  const trackerFields: TrackerField[] = mode === 'signin'
    ? [{ label: 'Email', done: email.trim().length > 0 }, { label: 'Password', done: password.length >= 6 }]
    : mode === 'forgot'
    ? [{ label: 'Email', done: email.trim().length > 0 }]
    : isMentor
    ? [
        { label: 'Type', done: true },
        { label: 'Name', done: fullName.trim().length > 0 },
        { label: 'Title', done: professionalTitle.trim().length > 0 },
        { label: 'Company', done: company.trim().length > 0 },
        { label: 'LinkedIn', done: linkedinUrl.trim().length > 0 },
        { label: 'Focus', done: mentorFocus.trim().length > 0 },
        { label: 'Email', done: email.trim().length > 0 },
        { label: 'Password', done: password.length >= 6 },
      ]
    : [
        { label: 'Type', done: true },
        { label: 'Name', done: fullName.trim().length > 0 },
        { label: 'Email', done: email.trim().length > 0 },
        { label: 'Password', done: password.length >= 6 },
      ];

  const allDone = trackerFields.every(f => f.done);

  /* ─────────────────────────────────────────────────── */
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 sm:p-8">

      {/* Backdrop */}
      <img
        src="/images/afrograd-login-backdrop.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-[#0a1628]/30 backdrop-blur-sm" />

      {/* ══ Card ══════════════════════════════════════ */}
      <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[32px] bg-white font-sans shadow-[0_24px_60px_rgba(10,22,40,0.28)]">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr]" style={{ minHeight: '640px' }}>

          {/* ── LEFT PANEL ─────────────────────────────── */}
          <div className="relative flex flex-col" style={{ maxHeight: '640px', overflow: 'hidden' }}>

            {/* ╔═ STICKY HEADER — never scrolls ══════════╗ */}
            <div className="relative z-10 flex flex-shrink-0 flex-col items-center bg-white px-8 pb-4 pt-10 sm:px-12">
              {/* Back Button */}
              <button
                type="button"
                onClick={onNavigateHome}
                aria-label="Back to home"
                className="absolute left-6 top-6 flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-xs font-semibold text-[#073264] transition-all hover:bg-slate-100 hover:text-[#e65100] hover:border-[#ffb27a] active:scale-95 shadow-xs cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>

              {/* Logo */}
              <button onClick={onNavigateHome} aria-label="Back to home"
                className="mb-5 transition-opacity hover:opacity-70">
                <img src="/afrograd-logo.png" alt="AfroGrad" className="h-10 w-auto" />
              </button>

              {/* Heading */}
              <h1 className="mb-1 text-center font-editorial text-[2.2rem] font-semibold leading-tight tracking-tight text-[#073264] sm:text-[2.6rem]">
                {heading}
              </h1>
              <p className="text-center text-sm text-[#64748b]">{subheading}</p>

              {/* Alerts */}
              {error && (
                <div className="mt-4 flex w-full items-start gap-3 rounded-[15px] border border-red-100 bg-red-50 p-3.5 text-sm text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}
              {success && (
                <div className="mt-4 flex w-full items-start gap-3 rounded-[15px] border border-green-100 bg-green-50 p-3.5 text-sm text-green-700">
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>{success}</p>
                </div>
              )}

              {/* ╚══ Liquid-glass blur strip (appears on scroll) ══╝ */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-6 left-0 right-0 h-8 transition-opacity duration-300"
                style={{
                  opacity: scrolled ? 1 : 0,
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.92) 0%, transparent 100%)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              />
            </div>
            {/* ╚═ END STICKY HEADER ══════════════════════╝ */}

            {/* ╔═ SCROLLABLE FORM BODY ════════════════════╗ */}
            <div
              ref={formScrollRef}
              onScroll={handleScroll}
              className={`flex-1 overflow-y-auto px-8 pb-6 sm:px-12 ${
                mode === 'signin' || mode === 'forgot' ? 'flex flex-col justify-center' : ''
              }`}
              style={{ scrollbarWidth: 'none' }}
            >
              {!success && (
                <form onSubmit={handleSubmit} className="space-y-4 pt-4" noValidate>

                  {/* Account type */}
                  {mode === 'signup' && (
                    <div className="grid grid-cols-2 gap-3">
                      {([
                        { value: 'member' as AccountType, Icon: GraduationCap, label: 'Member', desc: 'Learn, grow & get hired.' },
                        { value: 'mentor' as AccountType, Icon: Users, label: 'Mentor', desc: 'Guide & advise learners.' },
                      ] as const).map(({ value, Icon, label, desc }) => (
                        <button key={value} type="button" onClick={() => setAccountType(value)}
                          style={{ borderRadius: '15px' }}
                          className={`border p-3.5 text-left transition-all duration-150 ${
                            accountType === value
                              ? 'border-[#e65100] bg-[#fff4eb] ring-2 ring-[#e65100]/15'
                              : 'border-[#dde3ec] bg-[#f5f7fa] hover:border-[#e65100]/40'
                          }`}>
                          <Icon className={`mb-2 h-4 w-4 ${accountType === value ? 'text-[#e65100]' : 'text-[#94a3b8]'}`} />
                          <p className="text-sm font-bold text-[#0f172a]">{label}</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-[#64748b]">{desc}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Full name */}
                  {mode === 'signup' && (
                    <PillInput id="auth-fullname" type="text" placeholder="Full Name"
                      value={fullName} onChange={e => setFullName(e.target.value)}
                      required autoComplete="name" icon={User} />
                  )}

                  {/* Mentor fields */}
                  {mode === 'signup' && isMentor && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <PillInput id="auth-title" placeholder="Professional Title"
                          value={professionalTitle} onChange={e => setProfessionalTitle(e.target.value)}
                          required icon={Briefcase} />
                        <PillInput id="auth-company" placeholder="Company / Affiliation"
                          value={company} onChange={e => setCompany(e.target.value)} icon={Briefcase} />
                      </div>
                      <PillInput id="auth-linkedin" type="url" placeholder="LinkedIn URL"
                        value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} icon={Link2} />
                      <div className="relative">
                        <FileText className="pointer-events-none absolute left-4 top-3.5 h-[18px] w-[18px] text-[#aab4c4]" />
                        <textarea id="auth-focus" required rows={3}
                          placeholder="What can you help with? (resume reviews, data projects…)"
                          value={mentorFocus} onChange={e => setMentorFocus(e.target.value)}
                          style={{ borderRadius: '15px' }}
                          className={`${INPUT_BASE} pl-12 pr-5 resize-none`} />
                      </div>
                    </>
                  )}

                  {/* Email */}
                  <PillInput id="auth-email" type="email" placeholder="Email"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email" icon={Mail} />

                  {/* Password */}
                  {mode !== 'forgot' && (
                    <PillInput id="auth-password"
                      type={showPw ? 'text' : 'password'}
                      placeholder="Password" value={password}
                      onChange={e => setPassword(e.target.value)}
                      required minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      icon={Lock}
                      rightSlot={
                        <button type="button" onClick={() => setShowPw(p => !p)}
                          tabIndex={-1} aria-label={showPw ? 'Hide password' : 'Show password'}
                          className="text-[#aab4c4] transition-colors hover:text-[#64748b]">
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      }
                    />
                  )}

                  {/* Remember + Forgot */}
                  {mode === 'signin' && (
                    <div className="flex items-center justify-between px-1">
                      <label className="flex cursor-pointer items-center gap-2 select-none">
                        <span className="relative flex h-5 w-5 flex-shrink-0">
                          <input type="checkbox" checked={keepSignedIn}
                            onChange={e => setKeepSignedIn(e.target.checked)}
                            className="peer sr-only" />
                          <span className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-[#dde3ec] bg-white transition-all duration-150 peer-checked:border-[#e65100] peer-checked:bg-[#e65100]">
                            {keepSignedIn && (
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                              </svg>
                            )}
                          </span>
                        </span>
                        <span className="text-xs font-medium text-[#475569]">Keep me signed in</span>
                      </label>
                      <button type="button" onClick={() => switchMode('forgot')}
                        className="text-xs font-semibold text-[#e65100] transition-colors hover:text-[#cc4700]">
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {/* CTA — compact centered button */}
                  <button id="auth-submit" type="submit" disabled={isLoading}
                    className="mx-auto mt-2 block w-full max-w-[180px] rounded-[15px] bg-[#e65100] py-2.5 text-sm font-semibold text-white shadow-md shadow-[#e65100]/20 transition-all duration-150 hover:bg-[#cc4700] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed">
                    {isLoading ? 'Processing…'
                      : mode === 'forgot' ? 'Send Reset Link'
                      : mode === 'signup'
                      ? (isMentor ? 'Create Mentor Profile' : 'Create Member Account')
                      : 'Sign In'}
                  </button>

                  {/* Terms */}
                  {mode !== 'forgot' && (
                    <p className="pb-1 text-center text-[11px] leading-5 text-[#94a3b8]">
                      {mode === 'signup' ? 'By creating an account you agree to our' : 'By signing in you agree to our'}{' '}
                      <Link to="/terms" className="font-semibold text-[#e65100] hover:underline">Terms</Link>
                      {' '}and{' '}
                      <Link to="/privacy" className="font-semibold text-[#e65100] hover:underline">Privacy policy</Link>.
                    </p>
                  )}
                </form>
              )}

              {/* Mode switch */}
              {mode !== 'forgot' && (
                <p className="py-3 text-center text-sm text-[#64748b]">
                  {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button type="button" onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
                    className="font-bold text-[#e65100] hover:underline">
                    {mode === 'signup' ? 'Sign In' : 'Create account'}
                  </button>
                </p>
              )}
              {mode === 'forgot' && success && (
                <p className="py-3 text-center text-sm text-[#64748b]">
                  <button type="button" onClick={() => switchMode('signin')}
                    className="font-bold text-[#e65100] hover:underline">Back to Sign In</button>
                </p>
              )}
            </div>
            {/* ╚═ END SCROLLABLE BODY ═════════════════════╝ */}

            {/* ╔═ FIELD TRACKER (Mentor Signup only) ══════╗ */}
            {mode === 'signup' && isMentor && (
              <div className="flex flex-shrink-0 items-center justify-center gap-2 border-t border-[#f0f2f5] bg-white px-6 py-2.5">
                {trackerFields.map((f, i) => (
                  <div key={i} title={f.label}
                    className={`h-[5px] rounded-full transition-all duration-300 ${
                      f.done ? 'bg-[#e65100] w-6' : 'bg-[#dde3ec] w-[5px]'
                    }`}
                  />
                ))}
                {allDone && (
                  <span className="ml-1 text-[10px] font-bold text-[#e65100] tracking-wide">All set ✓</span>
                )}
                {/* Scroll hint — only when not scrolled and form overflows */}
                {!scrolled && (
                  <ChevronDown className="ml-auto h-3.5 w-3.5 animate-bounce text-[#aab4c4]" aria-label="Scroll for more" />
                )}
              </div>
            )}
            {/* ╚═ END TRACKER ════════════════════════════╝ */}

          </div>{/* /left panel */}

          {/* ── RIGHT: Image panel ─────────────────────── */}
          <div className="relative hidden overflow-hidden lg:block">
            <div className="absolute inset-4 overflow-hidden rounded-[22px]">
              <img
                src="/images/web/collaborative_study_in_a_sunlit_learning_space-1200.webp"
                srcSet="/images/web/collaborative_study_in_a_sunlit_learning_space-800.webp 800w, /images/web/collaborative_study_in_a_sunlit_learning_space-1200.webp 1200w"
                sizes="(min-width: 1024px) 50vw, 100vw"
                alt="AfroGrad — learn for mastery, build for life"
                className="h-full w-full object-cover object-[72%_center]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a1628]/90 via-[#0a1628]/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-10">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-orange-300/80">
                  Jeli by AfroGrad
                </p>
                <h2 className="font-editorial text-4xl font-semibold leading-tight text-white">
                  Learn for mastery.<br />Build for life.
                </h2>
                <div className="mt-5 flex flex-wrap gap-2">
                  {['AI-powered learning', 'Mentor network', 'Career tools'].map(tag => (
                    <span key={tag}
                      className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>{/* /grid */}
      </div>{/* /card */}
    </div>
  );
};
