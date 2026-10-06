
import React from 'react';
import { Job, Course, Event, University, UserProfile, Blog } from '../types';
import { Button } from './Button';
import {
  Clock, MapPin, Linkedin, Briefcase, Users, Trophy, Calendar,
  ArrowUpRight, School, Sparkles, CheckCircle, BookOpen, DollarSign, CalendarClock
} from 'lucide-react';

interface SharedViewProps {
  isPublic?: boolean;
  onAction?: (id: string) => void;
  onSecondaryAction?: (item: { id: string }) => void; // e.g., Optimize Resume
  /** Offer shown when the list is empty. Omitted on public surfaces, where
   *  there is usually nothing useful for a signed-out visitor to do. */
  emptyAction?: { label: string; onClick: () => void };
  onViewDetails?: (item: { id: string }) => void;
  user?: UserProfile;
}

const formatBudget = (job: Job) => {
  if (!job.budgetType || job.budgetType === 'Not specified') return job.salaryRange || '';
  const currency = job.budgetCurrency || 'USD';
  const min = job.budgetMin ? `${currency} ${job.budgetMin.toLocaleString()}` : '';
  const max = job.budgetMax ? `${currency} ${job.budgetMax.toLocaleString()}` : '';
  const range = min && max ? `${min} - ${max}` : min || max;
  return range ? `${range} ${job.budgetType.toLowerCase()}` : job.budgetType;
};

export const JobsList: React.FC<
  SharedViewProps & {
    jobs: Job[];
    /** True when the caller is filtering, so an empty list means "no matches"
     *  rather than "nothing exists". The two need different offers: one is
     *  recoverable by the user, the other is not. */
    isFiltered?: boolean;
    onClearFilters?: () => void;
  }
> = ({ jobs, isPublic, onAction, onSecondaryAction, onViewDetails, user, isFiltered, onClearFilters }) => (
  <div className="directory-list flex flex-col gap-3.5 w-full">
    {jobs.length === 0 && (
      <div className="text-center py-16 text-slate-400 bg-surface rounded-[2px] border border-slate-200">
        <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-40 text-secondary-900" />
        {isFiltered ? (
          <>
            <p className="font-editorial text-lg font-bold text-secondary-900">No roles match these filters</p>
            <p className="text-xs sm:text-sm mt-1 text-slate-500">Widen the search to see the full list.</p>
            {onClearFilters && (
              <button type="button" onClick={onClearFilters} className="ag-control-button mt-4 px-4 py-2 bg-brand-500 text-white">
                Clear filters
              </button>
            )}
          </>
        ) : (
          <>
            <p className="font-editorial text-lg font-bold text-secondary-900">No roles listed yet</p>
            <p className="text-xs sm:text-sm mt-1 text-slate-500">
              The career coach can help you work out what to aim for while the board fills up.
            </p>
            {onSecondaryAction && (
              <button
                type="button"
                onClick={() => onSecondaryAction({ id: '' })}
                className="ag-control-button mt-4 px-4 py-2 bg-brand-500 text-white"
              >
                Ask the career coach
              </button>
            )}
          </>
        )}
      </div>
    )}
    {jobs.map(job => {
      const isApplied = user?.appliedJobIds?.includes(job.id);
      const budgetLabel = formatBudget(job);
      const isGigLike = job.category === 'Gig' || job.category === 'Project';
      return (
        <div
          key={job.id}
          className="relative p-4 sm:p-5 rounded-[2px] border border-slate-200 bg-surface hover:border-secondary-900 shadow-2xs transition-colors flex flex-col gap-3 group cursor-pointer"
          onClick={() => onViewDetails && onViewDetails(job)}
          role="article"
          aria-label={`${job.title} at ${job.company}`}
        >
          {/* Top Row: Logo + Title/Company + Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <img
                src={job.logo}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-[2px] object-cover bg-slate-100 border border-slate-200 shrink-0"
                alt={`${job.company} logo`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-editorial font-bold text-base sm:text-lg text-secondary-900 group-hover:text-brand-500 transition-colors leading-snug">
                    {job.title}
                  </h3>
                  {job.category === 'Internship' && (
                    <span className="bg-orange-50 text-brand-500 border border-orange-200 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-[2px]">
                      Early career
                    </span>
                  )}
                  {isGigLike && (
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-[2px]">
                      Proposal work
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-0.5">{job.company}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 self-start sm:self-center shrink-0" onClick={(e) => e.stopPropagation()}>
              {!isPublic && onSecondaryAction && (
                <button
                  type="button"
                  onClick={() => onSecondaryAction({ id: job.id })}
                  className="h-8 px-3 rounded-[2px] border border-slate-200 bg-surface hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-secondary-500" aria-hidden="true" />
                  <span>Optimize</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onAction && onAction(job.id)}
                disabled={isApplied}
                className={`h-8 px-4 rounded-[2px] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs ${
                  isApplied
                    ? 'bg-slate-100 text-slate-400 border border-slate-200'
                    : 'bg-brand-500 hover:bg-brand-400 text-white'
                }`}
              >
                {isPublic ? 'View Role' : isApplied ? 'Applied' : isGigLike ? 'Submit Proposal' : 'Apply'}
              </button>
            </div>
          </div>

          {/* Metadata Row: Location, Type, Category, Time, Budget */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 font-medium">
            <span className="bg-slate-100/80 border border-slate-200 px-2 py-0.5 rounded-[2px] flex items-center gap-1">
              <MapPin className="w-3 h-3 text-secondary-900" aria-hidden="true" /> {job.location}
            </span>
            <span className="bg-slate-100/80 border border-slate-200 px-2 py-0.5 rounded-[2px]">{job.type}</span>
            <span className="bg-slate-100/80 border border-slate-200 text-slate-700 px-2 py-0.5 rounded-[2px]">{job.category}</span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-slate-400">
              <Clock className="w-3 h-3" aria-hidden="true" /> {job.postedAt}
            </span>
            {budgetLabel && (
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-[2px] font-semibold flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                {budgetLabel}
              </span>
            )}
            {job.estimatedTimeline && (
              <span className="bg-blue-50 text-secondary-900 border border-blue-200 px-2 py-0.5 rounded-[2px] font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3 text-secondary-900" aria-hidden="true" />
                {job.estimatedTimeline}
              </span>
            )}
            {job.deadline && (
              <span className="inline-flex items-center gap-1 text-slate-500 font-medium pl-1">
                <CalendarClock className="w-3 h-3 text-secondary-900" aria-hidden="true" />
                Apply by {new Date(job.deadline).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Description Snippet */}
          {job.description && (
            <p className="text-xs sm:text-sm text-slate-600 font-reading line-clamp-2 leading-relaxed">
              {job.description}
            </p>
          )}

          {/* Skills Badges */}
          {job.skills && job.skills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
              {job.skills.slice(0, 6).map(skill => (
                <span key={skill} className="text-[10px] sm:text-[11px] bg-orange-50 text-brand-500 border border-orange-200 px-2 py-0.5 rounded-[2px] font-semibold">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    })}
  </div>
);

export const CoursesList: React.FC<SharedViewProps & { courses: Course[] }> = ({ courses, isPublic, onAction, onViewDetails, user, emptyAction }) => (
    <div className="grid grid-cols-1 gap-x-6 gap-y-10 font-sans md:grid-cols-2 xl:grid-cols-3">
        {courses.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-400">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-40 text-secondary-900" />
            <p className="font-editorial text-lg font-bold text-secondary-900">No courses available yet</p>
            <p className="text-sm mt-1 text-slate-500">
              {emptyAction ? 'You can build the first one.' : 'New learning content is coming soon.'}
            </p>
            {emptyAction && (
              <button type="button" onClick={emptyAction.onClick} className="ag-control-button mt-4 px-4 py-2 bg-brand-500 text-white">
                {emptyAction.label}
              </button>
            )}
          </div>
        )}
        {courses.map(course => {
            const isEnrolled = user?.enrolledCourseIds?.includes(course.id);
            const cover = course.image || course.thumbnail;
            const meta = [course.duration, course.lessonCount ? `${course.lessonCount} lessons` : null].filter(Boolean).join(' · ');
            const openCourse = () => onViewDetails && onViewDetails(course);
            return (
            // No card box: cover, then type. The whole article is one target via
            // the title button's stretched ::after, so it is keyboard-reachable
            // instead of a clickable <div>.
            <article key={course.id} aria-label={course.title} className="group relative flex flex-col">
                <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-slate-100">
                    {cover && (
                      <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.03]"
                      />
                    )}
                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      {course.level && (
                        <span className="rounded-control bg-surface/95 px-2 py-1 text-xs font-semibold text-secondary-900 shadow-hairline">{course.level}</span>
                      )}
                      {course.status && course.status !== 'published' && (
                        <span className="rounded-control bg-amber-50 px-2 py-1 text-xs font-semibold capitalize text-amber-800 shadow-hairline">{course.status.replace('_', ' ')}</span>
                      )}
                    </div>
                </div>
                <div className="flex flex-1 flex-col pt-4">
                    <p className="text-sm text-slate-500">
                      {course.category}
                      {course.category && course.provider && <span aria-hidden="true" className="mx-1.5 text-slate-300">·</span>}
                      {course.provider}
                    </p>
                    <h3 className="mt-1.5 line-clamp-2 font-editorial text-xl font-semibold leading-snug text-secondary-900 [text-wrap:balance]">
                      <button
                        type="button"
                        onClick={openCourse}
                        className="text-left transition-colors group-hover:text-brand-700 focus-visible:outline-none after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-focus"
                      >
                        {course.title}
                      </button>
                    </h3>
                    {course.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{course.description}</p>}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm">
                        {meta ? (
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                            {meta}
                          </span>
                        ) : <span />}
                        {isPublic ? (
                          <span aria-hidden="true" className="inline-flex items-center gap-1 font-semibold text-brand-700">
                            View course
                            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 ease-out motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={`relative z-10 inline-flex min-h-[40px] items-center gap-1 rounded-control px-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${isEnrolled ? 'text-emerald-700' : 'text-brand-700 hover:bg-brand-50'}`}
                            onClick={() => {
                              if (!isEnrolled && onAction) {
                                onAction(course.id);
                              } else {
                                openCourse();
                              }
                            }}
                            disabled={isEnrolled}
                          >
                            {isEnrolled && <CheckCircle className="h-4 w-4" aria-hidden="true" />}
                            {isEnrolled ? 'Enrolled' : 'Start course'}
                            {!isEnrolled && <ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
                          </button>
                        )}
                    </div>
                </div>
            </article>
        );
      })}
    </div>
);

export const HackathonsList: React.FC<SharedViewProps & { hackathons: Event[] }> = ({ hackathons, isPublic, onAction, user }) => (
    <div className="directory-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {hackathons.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-400">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium text-lg">No events right now</p>
            <p className="text-sm mt-1">Stay tuned for upcoming hackathons and events.</p>
          </div>
        )}
        {hackathons.map(hack => {
            const isRegistered = user?.registeredEventIds?.includes(hack.id);
            return (
            <div key={hack.id} className="directory-card overflow-hidden flex flex-col" role="article" aria-label={hack.title}>
                <div className="h-48 relative">
                    <img src={hack.image} className="w-full h-full object-cover" alt={hack.title} />
                    <div className={`absolute top-3 right-3 backdrop-blur px-3 py-1 rounded-full text-xs font-bold ${hack.status === 'Open' ? 'bg-green-100/90 text-green-700' : 'bg-surface/90 text-slate-800'}`}>
                        {hack.status}
                    </div>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-display text-xl font-semibold text-secondary-900 line-clamp-1">{hack.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                        <Calendar className="w-4 h-4" aria-hidden="true" />
                        {hack.date}
                    </div>
                    <div className="flex gap-4 mb-6">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                            <Trophy className="w-4 h-4" aria-hidden="true" />
                            {hack.prize}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                            <Users className="w-4 h-4" aria-hidden="true" />
                            {hack.participants} Joined
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-6 h-14 overflow-hidden">
                        {hack.tags.map(tag => (
                            <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded h-fit">{tag}</span>
                        ))}
                    </div>
                    <Button
                        className="w-full mt-auto"
                        variant={hack.status === 'Closed' || isRegistered ? 'outline' : 'primary'}
                        disabled={hack.status === 'Closed' || isRegistered}
                        onClick={() => onAction && onAction(hack.id)}
                    >
                        {hack.status === 'Closed' ? 'Event Ended' : isRegistered ? 'Registered' : 'Register Now'}
                    </Button>
                </div>
            </div>
        )})}
    </div>
);

export const UniversitiesList: React.FC<SharedViewProps & { universities: University[] }> = ({ universities, onAction }) => (
    <div className="directory-list grid grid-cols-1 md:grid-cols-2 gap-6">
        {universities.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-400">
            <School className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium text-lg">No university partners yet</p>
            <p className="text-sm mt-1">Partner universities will appear here.</p>
          </div>
        )}
        {universities.map(uni => (
            <div key={uni.id} className="directory-card overflow-hidden flex flex-col md:flex-row">
                <div className="md:w-48 h-48 md:h-auto bg-slate-100 relative">
                    <img src={uni.image} className="w-full h-full object-cover" alt={uni.name} />
                </div>
                <div className="p-6 flex-1 flex flex-col justify-center">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="font-display font-semibold text-xl text-secondary-900">{uni.name}</h3>
                            <p className="text-slate-500 flex items-center gap-1 text-sm"><MapPin className="w-4 h-4" aria-hidden="true" /> {uni.location}</p>
                        </div>
                    </div>
                    
                    <div className="space-y-3 my-4">
                        <div className="text-sm">
                            <span className="text-slate-400 font-medium">Focus:</span> <span className="text-slate-700 font-semibold">{uni.focus}</span>
                        </div>
                        <div className="text-sm">
                            <span className="text-slate-400 font-medium">Students:</span> <span className="text-slate-700 font-semibold">{uni.students.toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-auto">
                        {uni.tags.map(tag => (
                            <span key={tag} className="bg-stone-100 text-stone-700 text-xs px-2 py-1 rounded font-medium">{tag}</span>
                        ))}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <Button variant="outline" size="sm" onClick={() => onAction && onAction(uni.id)}>View Programs</Button>
                    </div>
                </div>
            </div>
        ))}
    </div>
);

export const MentorsList: React.FC<SharedViewProps & { members: UserProfile[] }> = ({ members, isPublic, onAction, user }) => (
    <div className="directory-list grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
    {members.length === 0 && (
      <div className="col-span-full text-center py-16 text-slate-400">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p className="font-medium text-lg">No mentors available yet</p>
        <p className="text-sm mt-1">Approved mentors will appear here soon.</p>
      </div>
    )}
    {members.map((member, index) => {
      const connected = user?.connectedMemberIds?.includes(member.id);
      const portrait = member.avatar?.includes('ui-avatars.com') ? `/avatars/user${(index % 4) + 1}.webp` : member.avatar;
      return (
      <article key={member.id} className="directory-card group relative overflow-hidden">
        <div className="relative h-28 overflow-hidden bg-gradient-to-r from-secondary-900 via-secondary-800 to-brand-700">
          <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]" />
          <div className="absolute -right-8 -top-16 h-40 w-40 rotate-12 border-[22px] border-white/10" />
        </div>
        <div className="relative px-5 pb-5 pt-14 sm:px-6 sm:pb-6">
          <img src={portrait} alt={member.name} className="absolute -top-12 left-5 h-24 w-24 rounded-2xl border-[5px] border-white bg-slate-100 object-cover shadow-md sm:left-6" />
          <div className="absolute right-5 top-4 flex items-center gap-2 sm:right-6">
            {/* No "Verified mentor" badge: nothing verifies mentors yet (account_type is self-selected at signup). Add one back only behind a real verification field. */}
            {member.linkedinUrl && <a href={member.linkedinUrl} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-blue-600 hover:border-blue-300 hover:bg-blue-50" aria-label={`${member.name} on LinkedIn`}><Linkedin className="h-4 w-4" /></a>}
          </div>
          <h3 className="text-xl font-semibold text-secondary-900">{member.name}</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">{member.role}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Briefcase className="h-3.5 w-3.5 text-brand-600" />{member.company}</p>
          <p className="mt-4 line-clamp-2 min-h-12 text-sm leading-6 text-slate-600">{member.bio}</p>
          <div className="mt-5 grid grid-cols-2 divide-x divide-slate-200 border-y border-slate-200 py-3 text-center"><div><p className="text-lg font-semibold text-secondary-900">1:1</p><p className="text-[9px] uppercase tracking-wider text-slate-400">Guidance</p></div><div><p className="text-lg font-semibold text-secondary-900">{member.skills?.length || 3}</p><p className="text-[9px] uppercase tracking-wider text-slate-400">Focus areas</p></div></div>
          <button type="button" onClick={() => onAction && onAction(member.id)} disabled={connected} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-filled text-sm font-bold text-white transition hover:bg-filled-hover disabled:bg-green-100 disabled:text-green-800"><Users className="h-4 w-4" />{connected ? 'Request sent' : isPublic ? 'Get in touch' : 'Connect'}</button>
        </div>
      </article>
    )})}
  </div>
);

export const BlogsList: React.FC<SharedViewProps & { blogs: Blog[] }> = ({ blogs, onViewDetails, emptyAction }) => (
  <div className="directory-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {blogs.length === 0 && (
      <div className="col-span-full text-center py-16 text-slate-400">
        <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p className="font-medium text-lg">No field notes yet</p>
        <p className="text-sm mt-1">
          {emptyAction ? 'The courses are the place to start meanwhile.' : 'Check back later for new articles.'}
        </p>
        {emptyAction && (
          <button type="button" onClick={emptyAction.onClick} className="ag-control-button mt-4 px-4 py-2 bg-brand-500 text-white">
            {emptyAction.label}
          </button>
        )}
      </div>
    )}
    {blogs.map(blog => (
      <div key={blog.id} className="bg-surface rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col cursor-pointer group" onClick={() => onViewDetails && onViewDetails(blog)}>
        {blog.coverImage && (
          <div className="h-48 bg-slate-100 overflow-hidden relative">
            <img src={blog.coverImage} alt={blog.title} className="w-full h-full object-cover transition-transform duration-500" />
          </div>
        )}
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex gap-2 mb-3 max-h-6 overflow-hidden">
            {blog.tags.map(tag => (
              <span key={tag} className="text-[10px] font-bold uppercase tracking-wider bg-brand-50 text-brand-600 px-2.5 py-1 rounded-full">{tag}</span>
            ))}
          </div>
          <h3 className="font-bold text-xl text-slate-900 mb-2 leading-tight group-hover:text-brand-600 transition-colors line-clamp-2">{blog.title}</h3>
          
          {/* Render excerpt carefully since it's HTML */}
          <div className="text-sm text-slate-600 mb-6 line-clamp-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: blog.excerpt }} />
          
          <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
               {blog.author.avatar ? (
                  <img src={blog.author.avatar} alt={blog.author.name} className="w-6 h-6 rounded-full bg-slate-200" />
               ) : (
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                      {blog.author.name.charAt(0)}
                  </div>
               )}
               <span className="text-xs font-semibold text-slate-700">{blog.author.name}</span>
            </div>
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(blog.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'})}
            </span>
          </div>
        </div>
      </div>
    ))}
  </div>
);
