import React, { useEffect, useState } from 'react';
import { ArrowLeft, AlertCircle, CheckCircle, Lock } from 'lucide-react';
import { Button } from './Button';
import { supabase } from '../services/supabase';

interface ResetPasswordProps {
  onComplete: () => void;
}

export const ResetPassword: React.FC<ResetPasswordProps> = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const prepareRecoverySession = async () => {
      const code = new URLSearchParams(window.location.search).get('code');

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setError('This reset link is invalid or has expired. Request a new password reset email.');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to verify this reset link.');
      } finally {
        setIsReady(true);
      }
    };

    prepareRecoverySession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess('Your password has been updated.');
    setTimeout(onComplete, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-3xl shadow-xl p-8 duration-300 relative">
        <button
          onClick={() => window.location.assign('/login')}
          className="mb-6 p-2 -ml-2 hover:bg-slate-50 rounded-full transition-colors"
          aria-label="Back to sign in"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-brand-500 to-orange-400 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-brand-500/20">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Set New Password</h1>
          <p className="text-slate-500">Choose a new password for your AfroGrad account.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3 text-green-700 text-sm">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-surface focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-colors font-medium text-slate-900"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-surface focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-colors font-medium text-slate-900"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-14 text-lg font-bold rounded-xl shadow-xl shadow-brand-500/20 mt-2"
              isLoading={isLoading || !isReady}
              disabled={!isReady}
            >
              Update Password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};
