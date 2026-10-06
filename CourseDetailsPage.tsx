import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  FileImage,
  FileText,
  Film,
  HelpCircle,
  Home,
  Layers3,
  Menu,
  Paperclip,
  PlayCircle,
  Presentation,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from './Button';
import { Course, CourseLesson, CourseModule } from '../types';
import { db } from '../services/db';
import { supabase } from '../services/supabase';
import { parseLessonFlashcards, parseLessonQuiz, shuffleQuizOptions, splitLessonSegments } from '../services/lessonStudyContent';
import { sanitizeLessonHtml } from '../services/sanitizeHtml';
import { isLabEnabledForCourse } from '../services/labModels';
import { JeliLab } from './lesson/JeliLab';
import { LessonTutor } from './lesson/LessonTutor';
import { canUseLessonTutor } from '../services/lessonTutor';
import LessonBody from './lesson/LessonBody';
import { LESSON_CONTENT_CLASS } from './lesson/lessonContentClass';

type LessonStep = CourseLesson & {
  moduleTitle: string;
  moduleIndex: number;
  lessonIndex: number;
};

type ModuleSummary = CourseModule & {
  moduleCompleted: number;
  moduleProgress: number;
};

type LessonContentType = 'read' | 'flashcards' | 'quiz';
type LessonView = 'lesson' | 'flashcards' | 'quiz' | 'assessment';

type StudyCard = {
  term: string;
  definition: string;
  example?: string;
};

type StudyQuestion = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

const lessonContentTypes: Array<{
  key: LessonContentType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'read', label: 'Read', icon: AlignLeft },
  { key: 'flashcards', label: 'Flashcards', icon: Layers3 },
  { key: 'quiz', label: 'Quiz', icon: CircleHelp },
];

const lessonContentMarkers: Record<LessonContentType, RegExp> = {
  read: /<h[12][^>]*>\s*(read|learn|lesson|overview)|learn:/i,
  flashcards: /zara-flashcards|flashcards?/i,
  quiz: /zara-quiz|quick check|quiz/i,
};

// Assessment detection is structural, not prose-based. The previous pattern
// matched the bare words "assessment" and "end test" anywhere in the lesson
// body, with no word boundaries — so "recommend tests" contains "end test", and
// a teaching lesson that merely discussed an assessment lost its flashcards and
// quiz and gained a clipboard icon. Three lessons across the shipped and
// authored courses tripped it. Match the section class an assessment actually
// carries, or an assessment heading; never loose prose.


const assessmentMarker =
  /class="[^"]*\bzara-final-test\b|<h[1-3][^>]*>\s*(?:final|module|unit)\s+assessment\b|<h[1-3][^>]*>\s*end[-\s]of[-\s](?:unit|module)\s+test\b/i;

function getLessonContentTypes(lesson?: Pick<CourseLesson, 'content'> | null): LessonContentType[] {
  const content = lesson?.content || '';
  if (!content.trim()) return [];
  const isAssessment = assessmentMarker.test(content);
  const types = new Set<LessonContentType>(['read']);
  if (!isAssessment) {
    types.add('flashcards');
    types.add('quiz');
  }
  lessonContentTypes.forEach((type) => {
    if (lessonContentMarkers[type.key].test(content)) types.add(type.key);
  });
  return lessonContentTypes.filter((type) => types.has(type.key)).map((type) => type.key);
}

function plainTextFromHtml(value: string) {
  if (!value) return '';
  if (typeof DOMParser !== 'undefined' && value.trimStart().startsWith('<')) {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    return doc.body.textContent?.replace(/\s+/g, ' ').trim() || '';
  }
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parses the real generated quiz questions out of a lesson's embedded HTML.
 * Options are shown in a seeded order, never stored order: stored courses put
 * the answer first almost every time (SPEC-002 REQ-1).
 */
function extractQuizQuestions(content: string | null | undefined): StudyQuestion[] {
  return parseLessonQuiz(content).map(shuffleQuizOptions).map((question) => ({
    ...question,
    explanation: question.explanation || 'Review the lesson section connected to this question.',
  }));
}

function extractStudyTools(lesson: LessonStep): { flashcards: StudyCard[]; quiz: StudyQuestion[] } {
  const flashcards: StudyCard[] = parseLessonFlashcards(lesson.content);
  const quiz: StudyQuestion[] = extractQuizQuestions(lesson.content);

  // No invented filler when a lesson has no generated study content: the
  // player shows an honest empty state instead of boilerplate cards and
  // study-skills questions that teach nothing about the subject.
  return { flashcards: flashcards.slice(0, 8), quiz: quiz.slice(0, 6) };
}

function moduleHasAssessment(module: Pick<CourseModule, 'lessons'>) {
  return module.lessons.some((lesson) => assessmentMarker.test(lesson.content || '') || /final assessment|module assessment/i.test(lesson.title));
}

function buildModuleAssessmentQuestions(module: CourseModule | null | undefined, fallbackLesson: LessonStep): StudyQuestion[] {
  const moduleLessons = module?.lessons?.length ? module.lessons : [fallbackLesson];
  const isAssessmentLesson = (title: string) => /final assessment|module assessment/i.test(title);

  // 1. Real assessment questions embedded in the final-assessment lesson
  //    itself (newer builds generate these).
  const assessmentLesson = moduleLessons.find((lesson) => isAssessmentLesson(lesson.title));
  const embedded = extractQuizQuestions(assessmentLesson?.content);
  if (embedded.length >= 3) return embedded.slice(0, 8);

  // 2. Sample the module's real lesson-quiz questions, round-robin across
  //    lessons so the assessment covers the whole unit's actual subject
  //    matter instead of generic study-skills prompts.
  const perLesson = moduleLessons
    .filter((lesson) => !isAssessmentLesson(lesson.title))
    .map((lesson) => extractQuizQuestions(lesson.content))
    .filter((questions) => questions.length > 0);
  const sampled: StudyQuestion[] = [...embedded];
  for (let round = 0; sampled.length < 6 && perLesson.some((questions) => questions[round]); round++) {
    for (const questions of perLesson) {
      if (questions[round] && sampled.length < 6) sampled.push(questions[round]);
    }
  }
  if (sampled.length >= 3) return sampled;

  // 3. Nothing extractable: no assessment rather than a fake one. The
  //    previous fallback invented six study-skills questions from lesson
  //    titles ('which response best proves mastery of…'), which tested
  //    nothing about the subject and read as broken to learners.
  return [];
}

/**
 * Shown when a lesson or module has no generated study content. Being explicit
 * beats inventing placeholder cards and questions: the author can see exactly
 * what needs rebuilding, and the learner is never quizzed on nothing.
 */
function StudyEmptyState({ kind }: { kind: 'flashcards' | 'quiz' | 'assessment' }) {
  const copy = {
    flashcards: 'No flashcards were generated for this lesson yet.',
    quiz: 'No quiz questions were generated for this lesson yet.',
    assessment: 'No assessment questions were generated for this module yet.',
  }[kind];
  return (
    <section className="rounded-card border border-slate-200 bg-surface p-8 text-center">
      <HelpCircle className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-secondary-900">{copy}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
        Rebuild this course in the AI course builder to generate practice and assessment content for it.
      </p>
    </section>
  );
}

function StepLines({ count, activeIndex }: { count: number; activeIndex: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(0, 1fr))` }}>
      {Array.from({ length: Math.max(count, 1) }, (_, index) => (
        <div key={index} className={`h-1 rounded-full transition-colors ${index <= activeIndex ? 'bg-brand-500' : 'bg-slate-200'}`} />
      ))}
    </div>
  );
}

function LessonModeSwitch({ value, onChange, disabled = false }: { value: Exclude<LessonView, 'assessment'>; onChange: (value: Exclude<LessonView, 'assessment'>) => void; disabled?: boolean }) {
  const modes: Array<{ key: Exclude<LessonView, 'assessment'>; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'lesson', label: 'Lesson', icon: AlignLeft },
    { key: 'flashcards', label: 'Flashcards', icon: Layers3 },
    { key: 'quiz', label: 'Quiz', icon: CircleHelp },
  ];

  // Underline tabs: the format is a view of one lesson, not a separate control
  // panel, so it sits on the page's own rule instead of in a filled pill.
  return (
    <div className="flex gap-6 border-b border-slate-200" aria-label="Lesson format">
      {modes.map((item) => {
        const Icon = item.icon;
        const selected = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected}
            disabled={disabled && item.key !== 'lesson'}
            onClick={() => onChange(item.key)}
            className={`-mb-px inline-flex min-h-[44px] items-center gap-2 border-b-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-40 ${
              selected ? 'border-brand-500 text-secondary-900' : 'border-transparent text-slate-500 hover:text-secondary-900'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function FlashcardViewer({ cards }: { cards: StudyCard[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
    setFlipped(false);
  }, [cards]);

  const activeCard = cards[Math.min(activeIndex, cards.length - 1)];
  if (!activeCard) return null;

  const goTo = (nextIndex: number) => {
    setActiveIndex(Math.max(0, Math.min(cards.length - 1, nextIndex)));
    setFlipped(false);
  };

  return (
    <section className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500">
          <span>Flashcard {activeIndex + 1} of {cards.length}</span>
          <button type="button" onClick={() => setFlipped(false)} className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
        <StepLines count={cards.length} activeIndex={activeIndex} />
      </div>

      <div className="flashcard-container min-h-[320px] w-full">
        <button
          type="button"
          onClick={() => setFlipped((prev) => !prev)}
          className={`flashcard-inner ${flipped ? 'is-flipped' : ''}`}
          aria-label="Flip flashcard"
        >
          <div className="flashcard-front">
            <p className="text-sm font-medium text-slate-500">Term</p>
            <h2 className="mt-6 font-display text-3xl font-semibold leading-tight text-secondary-900">{activeCard.term}</h2>
            <p className="mt-auto pt-8 text-sm font-semibold text-brand-700">Tap to flip</p>
          </div>
          <div className="flashcard-back">
            <p className="text-sm font-medium text-brand-800">Definition</p>
            <p className="mt-6 text-xl font-semibold leading-8 text-secondary-900">{activeCard.definition}</p>
            {activeCard.example && <p className="mt-4 rounded-control border border-brand-100 bg-surface px-4 py-3 text-sm leading-relaxed text-slate-700">{activeCard.example}</p>}
            <p className="mt-auto pt-8 text-sm font-semibold text-brand-700">Tap to flip back</p>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)}>
          <ChevronLeft className="w-4 h-4" />
          Previous
        </Button>
        <Button disabled={activeIndex === cards.length - 1} onClick={() => goTo(activeIndex + 1)}>
          Next card
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </section>
  );
}

function QuizViewer({
  questions,
  title = 'Quiz',
  description = 'Check your understanding and review problem areas.',
  assessment = false,
  onComplete,
}: {
  questions: StudyQuestion[];
  title?: string;
  description?: string;
  assessment?: boolean;
  onComplete?: (result: {
    correctAnswers: number;
    totalQuestions: number;
    answers: Record<string, string>;
    weakAreas: string[];
  }) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [reported, setReported] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
    setAnswers({});
    setChecked({});
    setReported(false);
  }, [questions]);

  const activeQuestion = questions[Math.min(activeIndex, questions.length - 1)];
  if (!activeQuestion) return null;

  const selected = answers[activeIndex];
  const isChecked = Boolean(checked[activeIndex]);
  const isCorrect = isChecked && selected === activeQuestion.answer;
  const isWrong = isChecked && selected !== activeQuestion.answer;
  const correctCount = questions.filter((question, index) => checked[index] && answers[index] === question.answer).length;
  const checkedCount = Object.keys(checked).length;

  const choose = (option: string) => {
    if (isChecked) return;
    setAnswers((prev) => ({ ...prev, [activeIndex]: option }));
  };

  const goTo = (nextIndex: number) => {
    setActiveIndex(Math.max(0, Math.min(questions.length - 1, nextIndex)));
  };

  const checkCurrentAnswer = () => {
    const nextChecked = { ...checked, [activeIndex]: true };
    setChecked(nextChecked);
    if (reported || Object.keys(nextChecked).length < questions.length) return;
    const correctAnswers = questions.filter((question, index) => answers[index] === question.answer).length;
    const weakAreas = questions
      .filter((question, index) => answers[index] !== question.answer)
      .map((question) => question.question)
      .slice(0, 8);
    setReported(true);
    onComplete?.({
      correctAnswers,
      totalQuestions: questions.length,
      answers: Object.fromEntries(Object.entries(answers).map(([key, value]) => [String(Number(key) + 1), value])),
      weakAreas,
    });
  };

  return (
    <section className="space-y-5">
      <div className={`rounded-card border p-5 ${assessment ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-surface'}`}>
        <p className={`text-sm font-medium ${assessment ? 'text-amber-800' : 'text-slate-500'}`}>
          {assessment ? 'Module final assessment' : 'Lesson practice'}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-secondary-900">{title}</h2>
        <p className={`mt-2 text-sm leading-6 ${assessment ? 'text-amber-900' : 'text-slate-500'}`}>{description}</p>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500">
          <span>Question {activeIndex + 1} of {questions.length}</span>
          <span>{correctCount}/{checkedCount || questions.length} strong areas</span>
        </div>
        <StepLines count={questions.length} activeIndex={activeIndex} />
      </div>

      <div className={`rounded-card border bg-surface p-6 transition-colors duration-200 ${isCorrect ? 'border-green-300' : isWrong ? 'border-red-300' : 'border-slate-200'}`}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold leading-tight text-secondary-900">{activeQuestion.question}</h2>
          {isChecked && (
            <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${isCorrect ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {isCorrect ? 'Correct' : 'Review'}
            </span>
          )}
        </div>

        <div className="mt-6 grid gap-3">
          {activeQuestion.options.map((option) => {
            const optionCorrect = isChecked && option === activeQuestion.answer;
            const optionWrong = isChecked && selected === option && option !== activeQuestion.answer;
            return (
              <button
                key={option}
                type="button"
                onClick={() => choose(option)}
                aria-pressed={selected === option}
                className={`min-h-[44px] rounded-control border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  selected === option ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 bg-surface text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                } ${optionCorrect ? '!border-green-300 !bg-green-50 !text-green-800' : ''} ${optionWrong ? '!border-red-300 !bg-red-50 !text-red-800' : ''}`}
              >
                {option}
              </button>
            );
          })}
        </div>

        {isChecked && (
          <div role="status" className={`mt-5 rounded-control px-4 py-3 text-sm leading-6 ${isCorrect ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>
            <p className="font-semibold">{isCorrect ? 'Good understanding' : 'Problem area found'}</p>
            <p>{activeQuestion.explanation}</p>
            {isWrong && <p className="mt-2">Suggested review: switch back to Lesson or Flashcards, then return to this question.</p>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)}>
          <ChevronLeft className="w-4 h-4" />
          Previous
        </Button>
        {!isChecked ? (
          <Button disabled={!selected} onClick={checkCurrentAnswer}>
            Check answer
          </Button>
        ) : (
          <Button disabled={activeIndex === questions.length - 1} onClick={() => goTo(activeIndex + 1)}>
            Next question
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </section>
  );
}

function LessonContentView({
  lesson,
  lessonParts,
  courseId,
  isAuthenticated,
}: {
  lesson: LessonStep;
  lessonParts: string[];
  courseId: string;
  isAuthenticated: boolean;
}) {
  // Sanitize first, then split: the lab's fallback markup and every HTML segment
  // come out of the cleaned document, so nothing reaches innerHTML unsanitized.
  const segments = useMemo(
    () => (lesson.content?.trimStart().startsWith('<') ? splitLessonSegments(sanitizeLessonHtml(lesson.content)) : []),
    [lesson.content],
  );
  const labsEnabled = isLabEnabledForCourse(courseId);

  return (
    <>
      {lesson.videoUrl && (
        <div className="mb-10">
          <VideoEmbed url={lesson.videoUrl} />
        </div>
      )}

      {/* The lesson title is already the page's h1; repeating the unit name
          here at display size pushed the first paragraph below the fold. */}
      <article>
        {lesson.content ? (
          lesson.content.trimStart().startsWith('<') ? (
            <div className="space-y-5">
              {segments.map((segment, index) =>
                segment.kind === 'lab' ? (
                  labsEnabled ? (
                    <JeliLab
                      key={`lab-${index}`}
                      lab={segment.lab}
                      courseId={courseId}
                      lessonId={lesson.id}
                      isAuthenticated={isAuthenticated}
                      fallbackHtml={segment.fallbackHtml}
                      fallbackClassName={LESSON_CONTENT_CLASS}
                    />
                  ) : (
                    <LessonBody key={`lab-${index}`} className={LESSON_CONTENT_CLASS} html={segment.fallbackHtml} />
                  )
                ) : (
                  <LessonBody key={`html-${index}`} className={LESSON_CONTENT_CLASS} html={segment.html} />
                ),
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {lessonParts.map((part, index) => (
                <p key={index} className="text-lg leading-8 text-slate-800 whitespace-pre-line">{part}</p>
              ))}
            </div>
          )
        ) : (
          <p className="text-lg leading-8 text-slate-800">Lesson content is being prepared.</p>
        )}
      </article>
    </>
  );
}

function ModuleAssessmentPrompt({ lesson }: { lesson: LessonStep }) {
  return (
    <section className="mt-12 rounded-card border border-amber-200 bg-amber-50 p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface text-amber-700 ring-1 ring-amber-200">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-800">End of module assessment</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-amber-950">{lesson.moduleTitle}</h2>
          <p className="mt-3 leading-7 text-amber-900">
            Complete a practical task that proves you can apply this module. Use your quiz problem areas to decide what needs more explanation before you submit.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-900">
            <li>Explain the main concept in your own words.</li>
            <li>Apply it to a realistic learner, workplace, or community scenario.</li>
            <li>Identify one area where you still need further explanation.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function flattenLessons(course: Course): LessonStep[] {
  return (course.modules || []).flatMap((module, moduleIndex) =>
    module.lessons.map((lesson, lessonIndex) => ({
      ...lesson,
      moduleTitle: module.title,
      moduleIndex,
      lessonIndex,
    }))
  );
}

function splitLessonParts(content: string): string[] {
  return content
    .split(/\n\s*\n|(?=\n(?:Step|Part|Exercise|Practice|Checkpoint)\s+\d+[:.)-])/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatConceptId(conceptId: string) {
  return conceptId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function getVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

function attachmentIcon(type?: string) {
  if (!type) return <Paperclip className="w-4 h-4" />;
  if (type.includes('image') || type.includes('gif')) return <FileImage className="w-4 h-4" />;
  if (type.includes('video')) return <Film className="w-4 h-4" />;
  if (type.includes('presentation') || type.includes('powerpoint') || type.includes('ppt')) return <Presentation className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function VideoEmbed({ url }: { url: string }) {
  const ytId = getYouTubeId(url);
  const vimeoId = getVimeoId(url);

  if (ytId) {
    return (
      <div className="aspect-video rounded-card overflow-hidden">
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
          title="Lesson video"
        />
      </div>
    );
  }

  if (vimeoId) {
    return (
      <div className="aspect-video rounded-card overflow-hidden">
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
          title="Lesson video"
        />
      </div>
    );
  }

  return (
    <video controls className="w-full rounded-card">
      <source src={url} />
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 text-sm">
        <PlayCircle className="w-3.5 h-3.5" /> Watch video
      </a>
    </video>
  );
}

/** Scrolls to the top, without the smooth glide for reduced-motion users. */
function scrollToTop() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

/** "25 min · Flashcards · Quiz": plain metadata instead of a row of chips. */
function lessonMeta(lesson: Pick<CourseLesson, 'content' | 'estimatedMinutes'>, isAssessment: boolean) {
  const parts: string[] = [];
  if (lesson.estimatedMinutes) parts.push(`${lesson.estimatedMinutes} min`);
  if (isAssessment) {
    parts.push('Assessment');
  } else {
    const types = getLessonContentTypes(lesson);
    if (types.includes('flashcards')) parts.push('Flashcards');
    if (types.includes('quiz')) parts.push('Quiz');
  }
  return parts.join(' · ');
}

/** Completed, current, assessment or not started; shape differs, not only colour. */
function LessonStatus({ completed, active, assessment }: { completed?: boolean; active: boolean; assessment: boolean }) {
  if (completed) return <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-label="Completed" />;
  if (assessment) return <ClipboardCheck className="mt-0.5 h-5 w-5 text-amber-700" aria-label="Assessment" />;
  return (
    <span
      aria-hidden="true"
      className={`mt-1 ml-0.5 grid h-4 w-4 place-items-center rounded-full border-2 ${active ? 'border-brand-500' : 'border-slate-300'}`}
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
    </span>
  );
}

const outlineRowClass =
  'grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 rounded-control px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

function CourseOutline({
  modules,
  activeLessonId,
  onSelect,
}: {
  modules: ModuleSummary[];
  activeLessonId?: string;
  onSelect: (lessonId: string, view?: LessonView) => void;
}) {
  return (
    <div>
      {modules.map((module, moduleIndex) => {
        const hasAssessment = moduleHasAssessment(module);
        const lastLesson = module.lessons[module.lessons.length - 1];
        const moduleDone = module.lessons.length > 0 && module.moduleCompleted === module.lessons.length;
        return (
          <section key={module.id} className="border-t border-slate-200 py-7 first:border-t-0 first:pt-2">
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3rem_minmax(0,1fr)]">
              {/* The units really are a sequence, so the number carries information. */}
              <p className="font-editorial text-2xl font-semibold leading-7 tabular-nums text-slate-400" aria-hidden="true">
                {moduleIndex + 1}
              </p>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold leading-7 text-secondary-900 [text-wrap:balance]">{module.title}</h3>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full origin-left rounded-full bg-brand-500"
                      style={{ transform: `scaleX(${module.moduleProgress / 100})` }}
                    />
                  </div>
                  <p className="text-xs tabular-nums text-slate-500">
                    {moduleDone ? 'Complete' : `${module.moduleCompleted} of ${module.lessons.length} done`}
                  </p>
                </div>

                <ol className="-mx-3 mt-4">
                  {module.lessons.map((lesson) => {
                    const isActive = lesson.id === activeLessonId;
                    const isAssessment = assessmentMarker.test(lesson.content || '') || /final assessment|module assessment/i.test(lesson.title);
                    const meta = lessonMeta(lesson, isAssessment);
                    return (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(lesson.id, isAssessment ? 'assessment' : 'lesson')}
                          aria-current={isActive ? 'step' : undefined}
                          className={`${outlineRowClass} ${isActive ? 'bg-brand-50' : 'hover:bg-slate-100'}`}
                        >
                          <LessonStatus completed={lesson.isCompleted} active={isActive} assessment={isAssessment} />
                          <span className="min-w-0">
                            <span className={`block text-[0.95rem] font-medium leading-6 ${isActive ? 'text-brand-800' : 'text-secondary-900'}`}>
                              {lesson.title}
                            </span>
                            {meta && <span className="mt-0.5 block text-xs text-slate-500">{meta}</span>}
                          </span>
                          {isActive ? <ArrowRight className="mt-1 h-4 w-4 text-brand-700" aria-hidden="true" /> : <span />}
                        </button>
                      </li>
                    );
                  })}
                  {!hasAssessment && lastLesson && (
                    <li>
                      <button
                        type="button"
                        onClick={() => onSelect(lastLesson.id, 'assessment')}
                        className={`${outlineRowClass} hover:bg-amber-50`}
                      >
                        <ClipboardCheck className="mt-0.5 h-5 w-5 text-amber-700" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-[0.95rem] font-medium leading-6 text-secondary-900">Module assessment</span>
                          <span className="mt-0.5 block text-xs text-slate-500">End of unit · Assessment</span>
                        </span>
                        <span />
                      </button>
                    </li>
                  )}
                </ol>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export const CourseDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [savingQuizAttempt, setSavingQuizAttempt] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [savingLessonId, setSavingLessonId] = useState<string | null>(null);
  const [completingCourse, setCompletingCourse] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [mode, setMode] = useState<'overview' | 'lesson'>('overview');
  const [lessonView, setLessonView] = useState<LessonView>('lesson');
  const [showOutline, setShowOutline] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: authData }, nextCourse] = await Promise.all([
        supabase.auth.getUser(),
        id ? db.getCourseById(id) : Promise.resolve(null),
      ]);

      setIsAuthenticated(Boolean(authData.user));
      if (authData.user && id) {
        const { data } = await supabase
          .from('course_enrollments')
          .select('id')
          .eq('user_id', authData.user.id)
          .eq('course_id', id)
          .maybeSingle();
        setIsEnrolled(Boolean(data));
      }

      setCourse(nextCourse);
      if (nextCourse) {
        const lessons = flattenLessons(nextCourse);
        setActiveLessonId((current) => {
          if (current && lessons.some((lesson) => lesson.id === current)) return current;
          return lessons.find((lesson) => !lesson.isCompleted)?.id || lessons[0]?.id || null;
        });
      }
      setLoading(false);
    };

    load();
  }, [id]);

  const refreshCourse = async () => {
    if (!id) return;
    const nextCourse = await db.getCourseById(id);
    setCourse(nextCourse);
    // Every path that changes progress funnels through here, so this is the one
    // place completion needs recording. The write is a no-op until the last
    // lesson lands and never overwrites an existing row, which also means a
    // learner who finished before this table existed gets their record on the
    // next visit rather than staying invisible.
    if (nextCourse) {
      const lessons = flattenLessons(nextCourse);
      void db.recordCourseCompletion({
        courseId: nextCourse.id,
        courseTitle: nextCourse.title,
        lessonsCompleted: lessons.filter((lesson) => lesson.isCompleted).length,
        lessonsTotal: lessons.length,
      });
    }
    return nextCourse;
  };

  const handleEnroll = async () => {
    if (!course) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const success = await db.enrollInCourse(course.id);
    if (success) setIsEnrolled(true);
  };

  const handleCompleteLesson = async (lessonId: string) => {
    if (!isAuthenticated) {
      navigate('/login');
      return false;
    }
    setSavingLessonId(lessonId);
    const success = await db.markLessonComplete(lessonId);
    if (success) await refreshCourse();
    setSavingLessonId(null);
    return success;
  };

  const handleNextLesson = async () => {
    if (!course) return;
    const lessons = flattenLessons(course);
    const activeIndex = lessons.findIndex((lesson) => lesson.id === activeLessonId);
    const activeLesson = lessons[activeIndex];
    if (!activeLesson) return;

    let latestCourse: Course | undefined | null = course;
    if (!activeLesson.isCompleted) {
      const success = await handleCompleteLesson(activeLesson.id);
      if (!success) return;
      latestCourse = await db.getCourseById(course.id);
      if (latestCourse) setCourse(latestCourse);
    }

    const latestLessons = latestCourse ? flattenLessons(latestCourse) : lessons;
    const nextLesson = latestLessons[activeIndex + 1];
    if (nextLesson) {
      setActiveLessonId(nextLesson.id);
      setLessonView('lesson');
      setMode('lesson');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCompleteCourse = async () => {
    if (!course) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const lessons = flattenLessons(course);
    setCompletingCourse(true);
    if (!isEnrolled) await db.enrollInCourse(course.id);
    const success = await db.markLessonsComplete(lessons.map((lesson) => lesson.id));
    if (success) {
      setIsEnrolled(true);
      const nextCourse = await refreshCourse();
      const latestLessons = nextCourse ? flattenLessons(nextCourse) : lessons;
      setActiveLessonId(latestLessons[latestLessons.length - 1]?.id || activeLessonId);
      setMode('overview');
    }
    setCompletingCourse(false);
  };

  const handleQuizComplete = async (
    lesson: LessonStep,
    mode: 'quiz' | 'assessment',
    result: {
      correctAnswers: number;
      totalQuestions: number;
      answers: Record<string, string>;
      weakAreas: string[];
    }
  ) => {
    if (!course || !isAuthenticated) return;
    // The tutor reads this attempt on the server, so it waits until the write lands.
    setSavingQuizAttempt(true);
    await db.recordLessonQuizAttempt({
      courseId: course.id,
      lessonId: lesson.id,
      mode,
      totalQuestions: result.totalQuestions,
      correctAnswers: result.correctAnswers,
      answers: result.answers,
      weakAreas: result.weakAreas,
      conceptIds: lesson.conceptIds || [],
    });
    setSavingQuizAttempt(false);
  };

  // The outline drawer is a modal surface: Escape closes it.
  useEffect(() => {
    if (!showOutline) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowOutline(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showOutline]);

  if (loading) {
    // Skeleton in the shape of the page, so nothing jumps when the course lands.
    return (
      <div className="min-h-screen bg-canvas" aria-busy="true" aria-label="Loading course">
        <div className="mx-auto max-w-[1040px] px-5 pt-24 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="space-y-4">
              <div className="h-4 w-48 rounded-control bg-slate-200 motion-safe:animate-pulse" />
              <div className="h-11 w-full max-w-lg rounded-control bg-slate-200 motion-safe:animate-pulse" />
              <div className="h-11 w-3/4 max-w-md rounded-control bg-slate-200 motion-safe:animate-pulse" />
              <div className="h-5 w-full max-w-xl rounded-control bg-slate-100 motion-safe:animate-pulse" />
            </div>
            <div className="aspect-[4/3] rounded-card bg-slate-200 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-center">
        <h1 className="font-editorial text-3xl font-semibold text-secondary-900 mb-2">Course not found</h1>
        <p className="text-slate-600 mb-6">This course is unavailable or no longer published.</p>
        <Button onClick={() => navigate('/learning')}>Back to learning</Button>
      </div>
    );
  }

  const lessons = flattenLessons(course);
  const lessonCount = course.lessonCount || lessons.length;
  const completedCount = course.completedLessonCount || 0;
  const progressPercent = lessonCount > 0 ? Math.round((completedCount / lessonCount) * 100) : 0;
  const activeIndex = Math.max(0, lessons.findIndex((lesson) => lesson.id === activeLessonId));
  const activeLesson = lessons[activeIndex];
  const lessonParts = activeLesson ? splitLessonParts(activeLesson.content) : [];
  const activeModule = activeLesson ? course.modules?.[activeLesson.moduleIndex] : null;
  const activeHasAssessment = activeLesson ? assessmentMarker.test(activeLesson.content || '') || /final assessment|module assessment/i.test(activeLesson.title) : false;
  const moduleAlreadyHasAssessment = Boolean(activeModule && moduleHasAssessment(activeModule));
  const isLastLessonInModule = Boolean(activeModule && activeLesson && activeLesson.lessonIndex === activeModule.lessons.length - 1);
  const showModuleAssessmentPrompt = Boolean(activeLesson && isLastLessonInModule && !activeHasAssessment && !moduleAlreadyHasAssessment);
  const nextLesson = lessons[activeIndex + 1];
  const previousLesson = lessons[activeIndex - 1];
  const moduleSummaries: ModuleSummary[] = (course.modules || []).map((module) => {
    const moduleCompleted = module.lessons.filter((lesson) => lesson.isCompleted).length;
    const moduleProgress = module.lessons.length > 0 ? Math.round((moduleCompleted / module.lessons.length) * 100) : 0;
    return { ...module, moduleCompleted, moduleProgress };
  });
  const hasResources = Boolean(
    activeLesson?.resourceUrl ||
      (activeLesson?.attachments && activeLesson.attachments.length > 0)
  );
  const studyTools = activeLesson ? extractStudyTools(activeLesson) : { flashcards: [], quiz: [] };
  const assessmentQuestions = activeLesson ? buildModuleAssessmentQuestions(activeModule, activeLesson) : [];
  const showAssessmentMode = Boolean(activeHasAssessment || showModuleAssessmentPrompt || lessonView === 'assessment');

  const courseImage = course.image || course.thumbnail;
  const hasStarted = completedCount > 0;
  const isFinished = lessonCount > 0 && completedCount >= lessonCount;
  const totalMinutes = lessons.reduce((sum, lesson) => sum + (lesson.estimatedMinutes || 0), 0);
  const durationLabel = totalMinutes >= 60
    ? `${Math.floor(totalMinutes / 60)} h${totalMinutes % 60 ? ` ${totalMinutes % 60} min` : ''}`
    : totalMinutes > 0 ? `${totalMinutes} min` : '';
  const unitCount = moduleSummaries.length;
  const contentSummary = [
    unitCount ? `${unitCount} ${unitCount === 1 ? 'unit' : 'units'}` : '',
    `${lessonCount} ${lessonCount === 1 ? 'lesson' : 'lessons'}`,
    durationLabel,
  ].filter(Boolean).join(' · ');
  const lessonPosition = lessons.length > 0 ? (activeIndex + 1) / lessons.length : 0;
  const courseMeta = [course.category, course.level, course.duration].filter(Boolean);

  const openLesson = (lessonId: string, view: LessonView = 'lesson') => {
    setActiveLessonId(lessonId);
    setLessonView(view);
    setMode('lesson');
    scrollToTop();
  };

  const headerButton =
    'inline-flex h-10 min-w-[2.5rem] items-center justify-center gap-2 rounded-control px-2.5 text-sm font-semibold text-secondary-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';
  const lessonNavCard =
    'group flex min-h-[4.5rem] flex-col justify-center rounded-card border border-slate-200 bg-surface px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60';

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header
        style={{
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          backdropFilter: 'blur(20px) saturate(180%)',
        }}
        className="sticky top-0 z-30 border-b border-white/40 bg-white/45 shadow-sm transition-all duration-200"
      >
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2 px-3 sm:px-5">
          {mode === 'lesson' ? (
            <button type="button" onClick={() => { setMode('overview'); scrollToTop(); }} className={headerButton} aria-label="Back to course overview">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Overview</span>
            </button>
          ) : (
            <button type="button" onClick={() => navigate('/learning')} className={headerButton}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Learning
            </button>
          )}

          {mode === 'lesson' && activeLesson && (
            <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-slate-600">
              <span className="hidden md:inline">{course.title}</span>
              <span className="hidden md:inline text-slate-300" aria-hidden="true"> / </span>
              {activeLesson.title}
            </p>
          )}

          <div className="ml-auto flex items-center gap-1">
            {mode === 'lesson' && (
              <button type="button" onClick={() => setShowOutline(true)} className={headerButton} aria-label="Open course content">
                <Menu className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Contents</span>
              </button>
            )}
            <button type="button" onClick={() => navigate('/dashboard')} className={headerButton} aria-label="Dashboard">
              <Home className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {mode === 'lesson' && (
          <div className="h-0.5 bg-slate-200" aria-hidden="true">
            <div
              className="h-full origin-left bg-brand-500 transition-transform duration-300 ease-out"
              style={{ transform: `scaleX(${lessonPosition})` }}
            />
          </div>
        )}
      </header>

      {showOutline && (
        <div className="fixed inset-0 z-40 flex">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close course content"
            className="absolute inset-0 bg-secondary-950/40"
            onClick={() => setShowOutline(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="course-content-title"
            className="relative h-full w-full max-w-md overflow-y-auto border-r border-slate-200 bg-canvas px-5 py-6 shadow-pop sm:px-7"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">{completedCount} of {lessonCount} lessons complete</p>
                <h2 id="course-content-title" className="mt-1 font-editorial text-2xl font-semibold text-secondary-900">Course content</h2>
              </div>
              <button type="button" onClick={() => setShowOutline(false)} className={headerButton} aria-label="Close course content">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <CourseOutline
              modules={moduleSummaries}
              activeLessonId={activeLesson?.id}
              onSelect={(lessonId, view = 'lesson') => {
                openLesson(lessonId, view);
                setShowOutline(false);
              }}
            />
          </aside>
        </div>
      )}

      {mode === 'overview' ? (
        <main className="mx-auto max-w-[1040px] px-5 pb-24 pt-10 sm:px-8 sm:pt-16">
          <section className={`grid gap-8 lg:items-start ${courseImage ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-14' : ''}`}>
            <div className="min-w-0">
              {courseMeta.length > 0 && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                  {courseMeta.map((item, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && <span className="text-slate-300" aria-hidden="true">·</span>}
                      <span>{item}</span>
                    </React.Fragment>
                  ))}
                </p>
              )}
              <h1 className="mt-4 font-editorial text-[2.25rem] font-semibold leading-[1.1] text-secondary-900 [text-wrap:balance] sm:text-5xl sm:leading-[1.08]">
                {course.title}
              </h1>
              {course.description && (
                // Authored descriptions run to a full paragraph; three lines
                // carry the promise, the rest is one click away.
                <div className="mt-5 max-w-[60ch]">
                  <p
                    id="course-description"
                    className={`text-lg leading-8 text-slate-600 [text-wrap:pretty] ${showFullDescription ? '' : 'line-clamp-3'}`}
                  >
                    {course.description}
                  </p>
                  {course.description.length > 180 && (
                    <button
                      type="button"
                      aria-expanded={showFullDescription}
                      aria-controls="course-description"
                      onClick={() => setShowFullDescription((value) => !value)}
                      className="mt-2 rounded-control text-sm font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {showFullDescription ? 'Show less' : 'Read the full description'}
                    </button>
                  )}
                </div>
              )}
              {course.provider && (
                <p className="mt-5 text-sm text-slate-500">
                  By <span className="font-semibold text-secondary-900">{course.provider}</span>
                </p>
              )}
            </div>
            {courseImage && (
              <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-slate-100">
                <img src={courseImage} alt="" className="h-full w-full object-cover" />
              </div>
            )}
          </section>

          <section aria-label="Your progress" className="mt-12 grid gap-6 border-y border-slate-200 py-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              {activeLesson ? (
                <>
                  <p className="text-sm font-medium text-slate-500">
                    {isFinished ? 'Course complete' : hasStarted ? 'Up next' : 'Start with'}
                  </p>
                  <p className="mt-1.5 text-xl font-semibold leading-snug text-secondary-900 [text-wrap:balance]">{activeLesson.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeLesson.moduleTitle}
                    {activeLesson.estimatedMinutes ? ` · ${activeLesson.estimatedMinutes} min` : ''}
                  </p>
                </>
              ) : (
                <p className="text-lg font-semibold text-secondary-900">Lessons are being added to this course.</p>
              )}
              <div className="mt-5 flex items-center gap-3">
                <div className="h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full origin-left rounded-full bg-brand-500" style={{ transform: `scaleX(${progressPercent / 100})` }} />
                </div>
                <p className="shrink-0 text-sm tabular-nums text-slate-600">{completedCount} of {lessonCount} lessons</p>
              </div>
            </div>
            {activeLesson && (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                {/* Primary action first on a phone, rightmost on a wide screen. */}
                {!isFinished && (
                  <Button variant="ghost" onClick={handleCompleteCourse} isLoading={completingCourse}>
                    Mark all complete
                  </Button>
                )}
                <Button
                  size="lg"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    if (!isEnrolled) handleEnroll();
                    setMode('lesson');
                    scrollToTop();
                  }}
                >
                  {isFinished ? 'Review course' : hasStarted ? 'Continue' : 'Start course'}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </section>

          {moduleSummaries.length > 0 && (
            <section className="mt-14">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-editorial text-2xl font-semibold text-secondary-900">Course content</h2>
                <p className="text-sm text-slate-500">{contentSummary}</p>
              </div>
              <CourseOutline modules={moduleSummaries} activeLessonId={activeLesson?.id} onSelect={openLesson} />
            </section>
          )}
        </main>
      ) : activeLesson ? (
        <main className="mx-auto max-w-[760px] px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
          <header className="mb-10">
            <p className="text-sm text-slate-500">
              {activeLesson.moduleTitle}
              <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
              Lesson {activeIndex + 1} of {lessonCount}
            </p>
            <h1 className="mt-3 font-editorial text-3xl font-semibold leading-tight text-secondary-900 [text-wrap:balance] sm:text-[2.5rem]">
              {activeLesson.title}
            </h1>
            {Boolean(activeLesson.conceptIds?.length) && (
              <ul className="mt-5 flex flex-wrap gap-2" aria-label="Concepts in this lesson">
                {activeLesson.conceptIds!.slice(0, 6).map((conceptId) => (
                  <li key={conceptId} className="rounded-control border border-slate-200 bg-surface px-2.5 py-1 text-xs font-medium text-slate-600">
                    {formatConceptId(conceptId)}
                  </li>
                ))}
              </ul>
            )}
            {!activeHasAssessment && lessonView !== 'assessment' && (
              <div className="mt-8">
                <LessonModeSwitch value={lessonView} onChange={setLessonView} />
              </div>
            )}
          </header>

          {(lessonView === 'lesson' && !activeHasAssessment) && <LessonContentView lesson={activeLesson} lessonParts={lessonParts} courseId={course.id} isAuthenticated={isAuthenticated} />}
          {showAssessmentMode && lessonView === 'assessment' && !assessmentQuestions.length && <StudyEmptyState kind="assessment" />}
          {showAssessmentMode && lessonView === 'assessment' && assessmentQuestions.length > 0 && (
            <QuizViewer
              questions={assessmentQuestions}
              title={`${activeLesson.moduleTitle} Assessment`}
              description="This is harder than the lesson quiz. It checks transfer, reasoning, and whether you can apply the module ideas in a new context."
              assessment
              onComplete={(result) => handleQuizComplete(activeLesson, 'assessment', result)}
            />
          )}
          {activeHasAssessment && lessonView !== 'assessment' && !assessmentQuestions.length && <StudyEmptyState kind="assessment" />}
          {activeHasAssessment && lessonView !== 'assessment' && assessmentQuestions.length > 0 && (
            <QuizViewer
              questions={assessmentQuestions}
              title={`${activeLesson.moduleTitle} Assessment`}
              description="This final module assessment checks deeper understanding across the module."
              assessment
              onComplete={(result) => handleQuizComplete(activeLesson, 'assessment', result)}
            />
          )}
          {!activeHasAssessment && lessonView === 'flashcards' && (studyTools.flashcards.length ? <FlashcardViewer cards={studyTools.flashcards} /> : <StudyEmptyState kind="flashcards" />)}
          {!activeHasAssessment && lessonView === 'quiz' && (studyTools.quiz.length ? <QuizViewer questions={studyTools.quiz} onComplete={(result) => handleQuizComplete(activeLesson, 'quiz', result)} /> : <StudyEmptyState kind="quiz" />)}
          {isAuthenticated && canUseLessonTutor(activeLesson.id) && (
            (!activeHasAssessment && lessonView === 'quiz' && studyTools.quiz.length > 0)
            || (lessonView === 'assessment' && showAssessmentMode && assessmentQuestions.length > 0)
            || (activeHasAssessment && lessonView !== 'assessment' && assessmentQuestions.length > 0)
          ) && <LessonTutor lessonId={activeLesson.id} busy={savingQuizAttempt} />}

          {lessonView === 'lesson' && activeLesson.imageUrls && activeLesson.imageUrls.length > 0 && (
            <div className={`mt-10 grid gap-3 ${activeLesson.imageUrls.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
              {activeLesson.imageUrls.map((src, index) => (
                <img key={index} src={src} alt={`Lesson media ${index + 1}`} className="w-full rounded-card object-cover" />
              ))}
            </div>
          )}

          {showModuleAssessmentPrompt && lessonView !== 'assessment' && <ModuleAssessmentPrompt lesson={activeLesson} />}

          {lessonView === 'lesson' && hasResources && (
            <section className="mt-12 border-t border-slate-200 pt-7">
              <h2 className="font-editorial text-xl font-semibold text-secondary-900 mb-4">Resources</h2>
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {activeLesson.resourceUrl && (
                  <a href={activeLesson.resourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-brand-700 hover:text-brand-800">
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    Main resource
                  </a>
                )}
                {activeLesson.attachments?.map((att, index) => (
                  <a key={index} href={att.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-slate-700 hover:text-secondary-900">
                    {attachmentIcon(att.type)}
                    {att.name}
                  </a>
                ))}
              </div>
            </section>
          )}

          <nav aria-label="Lesson navigation" className="mt-16 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
            {previousLesson ? (
              <button
                type="button"
                className={lessonNavCard}
                onClick={() => {
                  setActiveLessonId(previousLesson.id);
                  setLessonView('lesson');
                  scrollToTop();
                }}
              >
                <span className="flex items-center gap-1 text-sm text-slate-500">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </span>
                <span className="mt-0.5 line-clamp-1 font-semibold text-secondary-900">{previousLesson.title}</span>
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
            {nextLesson ? (
              <button
                type="button"
                className={`${lessonNavCard} sm:items-end sm:text-right`}
                onClick={handleNextLesson}
                disabled={savingLessonId === activeLesson.id}
                aria-busy={savingLessonId === activeLesson.id}
              >
                <span className="flex items-center gap-1 text-sm text-slate-500">
                  {savingLessonId === activeLesson.id ? 'Saving progress…' : 'Next lesson'}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="mt-0.5 line-clamp-1 font-semibold text-secondary-900">{nextLesson.title}</span>
              </button>
            ) : (
              <div className="flex items-center sm:justify-end">
                <Button
                  size="lg"
                  isLoading={completingCourse || savingLessonId === activeLesson.id}
                  onClick={activeLesson.isCompleted ? handleCompleteCourse : handleNextLesson}
                  disabled={isFinished}
                >
                  {isFinished ? 'Course complete' : activeLesson.isCompleted ? 'Complete course' : 'Finish course'}
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </nav>
        </main>
      ) : (
        <main className="max-w-[760px] mx-auto px-6 py-20 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-4" aria-hidden="true" />
          <p className="font-medium text-secondary-900">Lessons are being added to this course.</p>
        </main>
      )}
    </div>
  );
};
