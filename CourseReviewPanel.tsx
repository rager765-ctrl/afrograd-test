import React, { useMemo, useState } from 'react';
import { CheckCircle2, Eye, GitCompareArrows, History, RotateCcw, X } from 'lucide-react';
import { Course, CourseStatus, CourseVersion } from '../types';
import { courseToSnapshot, diffCourseSnapshots } from '../services/courseReview';
import { Button } from './Button';

type ReviewStatus = Exclude<CourseStatus, 'published'>;

interface Props {
  course: Course;
  versions: CourseVersion[];
  saving?: boolean;
  onStatusChange: (status: ReviewStatus) => void;
  onPublish: () => void;
  onRestore: (versionId: string) => void;
}

const statusLabels: Record<CourseStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  published: 'Published',
  archived: 'Archived',
};

const statusClasses: Record<CourseStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  in_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  published: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-200 text-slate-600',
};

export const CourseReviewPanel: React.FC<Props> = ({ course, versions, saving = false, onStatusChange, onPublish, onRestore }) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(versions[0]?.id || null);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) || null;
  const diffs = useMemo(
    () => selectedVersion ? diffCourseSnapshots(selectedVersion.snapshot, courseToSnapshot(course)) : [],
    [course, selectedVersion]
  );
  const status = course.status || 'draft';

  return (
    <section className="border-t border-slate-100 pt-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold text-secondary-900">Review and release</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses[status]}`}>{statusLabels[status]}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Move the course through review before it becomes visible to learners.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'draft' && <Button size="sm" variant="outline" onClick={() => onStatusChange('in_review')} isLoading={saving}><CheckCircle2 className="h-4 w-4" />Submit for review</Button>}
          {status === 'in_review' && <Button size="sm" variant="outline" onClick={() => onStatusChange('approved')} isLoading={saving}><CheckCircle2 className="h-4 w-4" />Approve</Button>}
          {status === 'approved' && <Button size="sm" onClick={onPublish} isLoading={saving}><CheckCircle2 className="h-4 w-4" />Publish</Button>}
          {status !== 'draft' && status !== 'published' && <Button size="sm" variant="ghost" onClick={() => onStatusChange('draft')} isLoading={saving}>Return to draft</Button>}
          <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4" />Student preview</Button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2"><History className="h-4 w-4 text-brand-600" /><h4 className="text-sm font-bold text-secondary-900">Version history</h4></div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Snapshots are captured before course, module, and lesson edits.</p>
          <div className="mt-3 space-y-2">
            {versions.map((version) => (
              <div key={version.id} className={`flex items-center gap-2 rounded-lg border bg-surface p-2.5 ${selectedVersionId === version.id ? 'border-brand-300 ring-1 ring-brand-100' : 'border-slate-200'}`}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedVersionId(version.id)}>
                  <span className="block text-xs font-bold text-secondary-900">v{version.versionNumber} · {version.label}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{statusLabels[version.status]} · {new Date(version.createdAt).toLocaleString()}</span>
                </button>
                <button type="button" title={`Restore version ${version.versionNumber}`} onClick={() => onRestore(version.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-amber-50 hover:text-amber-700"><RotateCcw className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {!versions.length && <p className="rounded-lg border border-dashed border-slate-300 bg-surface p-4 text-xs text-slate-500">No saved versions yet. Your first edit will create one.</p>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-surface p-4">
          <div className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-brand-600" /><h4 className="text-sm font-bold text-secondary-900">Changes from selected version</h4></div>
          {selectedVersion ? (
            diffs.length ? <div className="mt-3 space-y-2">{diffs.slice(0, 12).map((diff) => <div key={`${diff.path}-${diff.before}-${diff.after}`} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5"><p className="text-xs font-bold text-secondary-900">{diff.path}</p><p className="mt-1 text-[11px] text-slate-500"><span className="text-red-600">{diff.before}</span><span className="mx-1.5">→</span><span className="text-emerald-700">{diff.after}</span></p></div>)}{diffs.length > 12 && <p className="text-xs text-slate-500">+ {diffs.length - 12} more changes</p>}</div>
            : <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">No differences from this version.</p>
          ) : <p className="mt-3 text-xs text-slate-500">Select a version to compare it with the current course.</p>}
        </div>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-secondary-950/45 p-4" onMouseDown={() => setPreviewOpen(false)}>
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">Student preview</p><h3 className="mt-1 font-display text-xl font-semibold text-secondary-900">{course.title || 'Untitled course'}</h3></div><button type="button" onClick={() => setPreviewOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100" aria-label="Close preview"><X className="h-5 w-5" /></button></header>
            <div className="overflow-y-auto p-6">
              <p className="max-w-2xl text-sm leading-6 text-slate-600">{course.description || 'No course description yet.'}</p>
              <div className="mt-6 space-y-4">{(course.modules || []).map((module, moduleIndex) => <article key={module.id || moduleIndex} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold text-secondary-900">{moduleIndex + 1}. {module.title}</h4><span className="text-xs text-slate-500">{module.lessons.length} lessons</span></div><div className="mt-3 space-y-2">{module.lessons.map((lesson, lessonIndex) => <div key={lesson.id || lessonIndex} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-secondary-900">{lessonIndex + 1}. {lesson.title}</p><p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">{lesson.content || 'No lesson content yet.'}</p></div>)}</div></article>)}</div>
              {!course.modules?.length && <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No modules have been added yet.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
