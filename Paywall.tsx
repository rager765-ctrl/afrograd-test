import React, { useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import {
  PLANS,
  formatCedis,
  paymentsEnabled,
  startCheckout,
  type Plan,
} from '../services/billing';
import { hasRegisteredProInterest, recordProInterest } from '../services/proInterest';
import type { UserProfile } from '../types';

/**
 * The plan chooser, shown on /pricing and over the app when the daily message
 * budget runs out.
 *
 * Three cards, in the layout the user asked for: picture, plan name, price,
 * one button, then what the plan includes. The emphasis sits on the last card
 * alone, so the page recommends rather than shouts.
 *
 * Until checkout is switched on (`paymentsEnabled()`: VITE_ENABLE_CHECKOUT=true plus a Paystack key), the paid buttons
 * record interest and say so. A button that opens a checkout which cannot take
 * money would be a fabricated flow, so the copy changes with the capability.
 */

/** Everything the paywall needs from a signed-in person. */
export type PaywallUser = Pick<UserProfile, 'id'> & { name?: string };

export interface PaywallProps {
  user?: PaywallUser | null;
  /** 'overlay' covers the app when the budget is gone; 'page' sits in /pricing. */
  variant?: 'page' | 'overlay';
  /** Today's real numbers. Shown above the cards on the overlay. */
  messagesRemaining?: number;
  dailyLimit?: number;
  onClose?: () => void;
  onLoginClick?: () => void;
  /** Free card action. Defaults to closing the overlay. */
  onContinueFree?: () => void;
  /** Overlay only: opens the full pricing page. */
  onSeePlans?: () => void;
}

const PlanCard: React.FC<{
  plan: Plan;
  emphasis: boolean;
  status: 'idle' | 'working' | 'registered';
  error?: string;
  onChoose: () => void;
}> = ({ plan, emphasis, status, error, onChoose }) => {
  const paid = plan.priceGhs > 0;
  const live = paymentsEnabled();
  const label = !paid
    ? plan.cta
    : status === 'registered'
      ? 'We will let you know'
      : status === 'working'
        ? 'Opening payment…'
        : live
          ? plan.cta
          : `Tell me when ${plan.name} opens`;

  return (
    <article className="flex h-full flex-col rounded-[18px] border border-[#073264]/12 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(7,50,100,0.45)] sm:p-6">
      <div className="overflow-hidden rounded-[12px] bg-[#f6f8fb]">
        <img
          src={plan.image.src}
          srcSet={plan.image.srcSet}
          sizes="(min-width: 768px) 360px, 100vw"
          alt={plan.image.alt}
          loading="lazy"
          decoding="async"
          className="aspect-[16/9] w-full object-cover object-top"
        />
      </div>

      <h3 className="mt-5 text-lg font-semibold text-[#073264]">{plan.name}</h3>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="font-editorial text-[2.6rem] font-semibold leading-none text-[#073264]">
          {plan.priceGhs === 0 ? 'Free' : formatCedis(plan.priceGhs)}
        </span>
        {plan.priceGhs > 0 && <span className="text-base text-[#61758a]">/month</span>}
      </p>

      <button
        type="button"
        onClick={onChoose}
        disabled={status === 'working' || status === 'registered'}
        className={
          emphasis
            ? 'ag-control-button ag-control-button-lg ag-button mt-5 w-full bg-[#073264] text-white hover:bg-[#0a4382] disabled:opacity-70'
            : paid
              ? 'ag-control-button ag-control-button-lg ag-button mt-5 w-full border border-[#073264]/20 bg-[#f6f8fb] text-[#073264] hover:bg-[#edf4fb] disabled:opacity-70'
              : 'ag-control-button ag-control-button-lg ag-button mt-5 w-full bg-[#f1f3f6] text-[#61758a] hover:bg-[#e7ebf1]'
        }
      >
        {label}
        {paid && status === 'idle' && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </button>

      {error && <p className="mt-2 text-sm leading-6 text-[#a83900]" role="alert">{error}</p>}

      <p className="mt-6 border-t border-[#073264]/12 pt-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#61758a]">
        {plan.includesLabel}
      </p>
      <ul className="mt-3 space-y-2.5">
        {plan.includes.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] leading-6 text-[#344b61]">
            <Check className="mt-1 size-4 shrink-0 text-[#a83900]" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
};

export const Paywall: React.FC<PaywallProps> = ({
  user,
  variant = 'page',
  messagesRemaining,
  dailyLimit,
  onClose,
  onLoginClick,
  onContinueFree,
  onSeePlans,
}) => {
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [registeredPlans, setRegisteredPlans] = useState<string[]>(() =>
    user?.id && hasRegisteredProInterest(user.id) ? PLANS.filter((plan) => plan.priceGhs > 0).map((plan) => plan.id) : [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const choose = async (plan: Plan) => {
    if (plan.priceGhs === 0) {
      (onContinueFree || onClose)?.();
      return;
    }
    if (!user?.id) {
      onLoginClick?.();
      return;
    }
    setErrors((current) => ({ ...current, [plan.id]: '' }));

    if (!paymentsEnabled()) {
      recordProInterest({
        userId: user.id,
        userName: user.name,
        registeredAt: new Date().toISOString(),
        messagesRemaining: messagesRemaining ?? 0,
        dailyLimit: dailyLimit ?? PLANS[0].messagesPerDay,
      });
      setRegisteredPlans((current) => [...current, plan.id]);
      return;
    }

    setBusyPlan(plan.id);
    try {
      const url = await startCheckout(plan.id, { id: user.id });
      window.location.assign(url);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [plan.id]: error instanceof Error ? error.message : 'Could not start the payment.',
      }));
      setBusyPlan(null);
    }
  };

  const outOfMessages = variant === 'overlay' && messagesRemaining === 0;

  const cards = (
    <div className="grid gap-5 md:grid-cols-3">
      {PLANS.map((plan, index) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          emphasis={index === PLANS.length - 1}
          status={
            registeredPlans.includes(plan.id) ? 'registered' : busyPlan === plan.id ? 'working' : 'idle'
          }
          error={errors[plan.id] || undefined}
          onChoose={() => { void choose(plan); }}
        />
      ))}
    </div>
  );

  const heading = outOfMessages ? 'You have used today’s messages.' : 'Keep learning without the daily wall.';
  const subheading = outOfMessages
    ? `Your ${dailyLimit ?? PLANS[0].messagesPerDay} free messages reset at midnight, and nothing you have written is lost. A paid plan lifts the daily cap now.`
    : 'Start free. Move up when the daily limit gets in the way of real work.';

  const footnote = paymentsEnabled()
    ? 'Prices in Ghana cedis, billed monthly. Pay with mobile money or card. Cancel any time.'
    : 'Paid plans are not open yet and no payment details are collected. Tell us which plan you want and we will contact you before they open.';

  const body = (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-editorial text-3xl font-semibold text-[#073264] [text-wrap:balance] sm:text-4xl">{heading}</h2>
        <p className="mt-4 text-base leading-7 text-[#496176]">{subheading}</p>
      </div>
      <div className="mt-10">{cards}</div>
      <p className="mt-8 text-center text-sm leading-6 text-[#61758a]">
        {footnote}
        {onSeePlans && (
          <>
            {' '}
            <button type="button" onClick={onSeePlans} className="font-semibold text-[#a83900] underline hover:text-[#073264]">
              See the full pricing page
            </button>
          </>
        )}
      </p>
    </>
  );

  if (variant === 'page') {
    return <section className="ag-static-light mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">{body}</section>;
  }

  return (
    <div
      className="ag-static-light fixed inset-0 z-[80] overflow-y-auto bg-[#0a1c33]/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="relative mx-auto my-8 w-full max-w-5xl rounded-[20px] bg-[#fffdf9] p-6 sm:p-10"
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full text-[#496176] transition-colors hover:bg-[#edf4fb] hover:text-[#073264] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e65100]/40"
          >
            <X className="size-5" />
          </button>
        )}
        <div id="paywall-title" className="sr-only">Plans</div>
        {body}
      </div>
    </div>
  );
};
