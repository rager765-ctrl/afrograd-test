import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Job } from '../types';
import { db } from '../services/db';
import { Button } from './Button';
import { MapPin, Briefcase, Clock, ArrowLeft, Upload, Linkedin, Globe, CheckCircle, DollarSign, Sparkles, FileText } from 'lucide-react';
import { supabase } from '../services/supabase';
import { draftJobProposal, scoreJobMatch } from '../services/geminiService';

export const JobDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Application Form State
  const [applicationStep, setApplicationStep] = useState<'details' | 'form' | 'success'>('details');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    coverLetter: '',
    linkedinUrl: '',
    portfolioUrl: '',
    proposalText: '',
    bidAmount: '',
    bidCurrency: 'USD',
    timelineEstimate: '',
    portfolioLinks: '',
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiNotes, setAiNotes] = useState('');
  const [aiMatchOutput, setAiMatchOutput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const isProposalJob = job?.proposalRequired || job?.category === 'Gig' || job?.category === 'Project';

  const formatBudget = (currentJob: Job) => {
    if (!currentJob.budgetType || currentJob.budgetType === 'Not specified') return currentJob.salaryRange || '';
    const currency = currentJob.budgetCurrency || 'USD';
    const min = currentJob.budgetMin ? `${currency} ${currentJob.budgetMin.toLocaleString()}` : '';
    const max = currentJob.budgetMax ? `${currency} ${currentJob.budgetMax.toLocaleString()}` : '';
    const range = min && max ? `${min} - ${max}` : min || max;
    return range ? `${range} ${currentJob.budgetType.toLowerCase()}` : currentJob.budgetType;
  };

  const buildJobDetails = (currentJob: Job) => [
    `${currentJob.title} at ${currentJob.company}`,
    `Category: ${currentJob.category}`,
    `Work mode: ${currentJob.type}`,
    `Location: ${currentJob.location}`,
    currentJob.description || '',
    currentJob.skills?.length ? `Skills: ${currentJob.skills.join(', ')}` : '',
    currentJob.requirements?.length ? `Requirements: ${currentJob.requirements.join('; ')}` : '',
    currentJob.deliverables?.length ? `Deliverables: ${currentJob.deliverables.join('; ')}` : '',
    formatBudget(currentJob) ? `Budget: ${formatBudget(currentJob)}` : '',
  ].filter(Boolean).join('\n');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Fetch user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
         setFormData(prev => ({
             ...prev,
             fullName: authUser.user_metadata.full_name || '',
             email: authUser.email || ''
         }));
      }

      // Fetch job
      const directJob = id ? await db.getJobById(id) : null;
      // Seed jobs only exist in dev seed mode; a failed list load just means not found.
      const jobs = directJob ? [] : await db.getJobs().catch(() => []);
      const foundJob = directJob || jobs.find(j => j.id === id);
      setJob(foundJob || null);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setResumeFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setIsSubmitting(true);

    try {
      let resumeUrl = '';
      if (resumeFile) {
        const uploadedPath = await db.uploadResume(resumeFile);
        if (uploadedPath) {
            resumeUrl = uploadedPath;
        }
      }

      const success = await db.applyForJob(job.id, {
        fullName: formData.fullName,
        email: formData.email,
        resumeUrl: resumeUrl,
        coverLetter: formData.coverLetter,
        linkedinUrl: formData.linkedinUrl,
        portfolioUrl: formData.portfolioUrl,
        proposalText: formData.proposalText,
        bidAmount: formData.bidAmount,
        bidCurrency: formData.bidCurrency,
        timelineEstimate: formData.timelineEstimate,
        portfolioLinks: formData.portfolioLinks.split('\n').map((link) => link.trim()).filter(Boolean),
        aiMatchSummary: aiMatchOutput,
        aiProposalDraft: formData.proposalText,
      });

      if (success) {
        setApplicationStep('success');
      } else {
        alert('Failed to submit application. Please try again.');
      }
    } catch (error) {
      console.error("Application error:", error);
      alert('An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMatchScore = async () => {
    if (!job) return;
    setIsAiLoading(true);
    const profileSummary = [
      formData.fullName,
      formData.coverLetter,
      formData.proposalText,
      aiNotes,
      formData.portfolioUrl,
    ].filter(Boolean).join('\n');
    const result = await scoreJobMatch(profileSummary || 'Candidate has not added details yet.', buildJobDetails(job));
    setAiMatchOutput(result);
    setIsAiLoading(false);
  };

  const handleProposalDraft = async () => {
    if (!job) return;
    setIsAiLoading(true);
    const profileSummary = [
      formData.fullName,
      formData.coverLetter,
      formData.portfolioUrl,
      formData.linkedinUrl,
    ].filter(Boolean).join('\n');
    const result = await draftJobProposal(profileSummary || 'Candidate has not added details yet.', buildJobDetails(job), aiNotes);
    setFormData((prev) => ({ ...prev, proposalText: result }));
    setAiMatchOutput(result);
    setIsAiLoading(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div></div>;
  }

  if (!job) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Job Not Found</h2>
            <p className="text-slate-500 mb-6">The job you are looking for does not exist or has been removed.</p>
            <Button onClick={() => navigate('/jobs')}>Back to Jobs</Button>
        </div>
    );
  }

  if (applicationStep === 'success') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-surface max-w-md w-full p-6 sm:p-8 rounded-3xl shadow-xl text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                    <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">{isProposalJob ? 'Proposal Sent!' : 'Application Sent!'}</h2>
                <p className="text-sm sm:text-base text-slate-650 mb-6 sm:mb-8">
                    Your {isProposalJob ? 'proposal' : 'application'} for <span className="font-semibold text-slate-900">{job.title}</span> at {job.company} has been submitted successfully. Good luck!
                </p>
                <div className="flex flex-col gap-3">
                    <Button onClick={() => navigate('/jobs')} variant="outline">Browse More Jobs</Button>
                    <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
                </div>
            </div>
        </div>
      );
  }

  if (applicationStep === 'form') {
      return (
          <div className="min-h-screen bg-slate-50 py-6 sm:py-12 px-4 sm:px-6 lg:px-8">
              <div className="max-w-3xl mx-auto">
                  <button onClick={() => setApplicationStep('details')} className="flex items-center text-slate-500 hover:text-slate-900 mb-6 transition-colors text-sm">
                      <ArrowLeft className="w-4 h-4 mr-2" /> Back to Job Details
                  </button>
                  
                  <div className="bg-surface rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="ag-static-dark bg-slate-900 p-5 sm:p-8 text-white">
                          <h1 className="text-xl sm:text-2xl font-bold mb-2">{isProposalJob ? 'Submit proposal for' : 'Apply for'} {job.title}</h1>
                          <p className="text-xs sm:text-sm text-slate-400">{job.company} • {job.location}</p>
                      </div>
                      
                      <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-6 sm:space-y-8">
                          {/* Personal Info */}
                          <div className="space-y-4">
                              <h3 className="text-base sm:text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Personal Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                  <div>
                                      <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Full Name</label>
                                      <input 
                                          type="text" 
                                          required
                                          className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors text-sm"
                                          value={formData.fullName}
                                          onChange={e => setFormData({...formData, fullName: e.target.value})}
                                      />
                                  </div>
                                  <div>
                                      <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Email Address</label>
                                      <input 
                                          type="email" 
                                          required
                                          className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors text-sm"
                                          value={formData.email}
                                          onChange={e => setFormData({...formData, email: e.target.value})}
                                      />
                                  </div>
                              </div>
                          </div>

                          {/* Links */}
                          <div className="space-y-4">
                              <h3 className="text-base sm:text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Links</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                  <div>
                                      <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">LinkedIn URL</label>
                                      <div className="relative">
                                          <Linkedin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                          <input 
                                              type="url" 
                                              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors text-sm"
                                              placeholder="https://linkedin.com/in/..."
                                              value={formData.linkedinUrl}
                                              onChange={e => setFormData({...formData, linkedinUrl: e.target.value})}
                                          />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">Portfolio / Website</label>
                                      <div className="relative">
                                          <Globe className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                          <input 
                                              type="url" 
                                              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors text-sm"
                                              placeholder="https://..."
                                              value={formData.portfolioUrl}
                                              onChange={e => setFormData({...formData, portfolioUrl: e.target.value})}
                                          />
                                      </div>
                                  </div>
                              </div>
                          </div>

                          {/* Resume */}
                          <div className="space-y-4">
                              <h3 className="text-base sm:text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Resume / CV</h3>
                              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-5 sm:p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
                                  <input 
                                      type="file" 
                                      required
                                      accept=".pdf,.doc,.docx"
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                      onChange={handleFileChange}
                                  />
                                  <div className="flex flex-col items-center">
                                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center mb-3">
                                          <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
                                      </div>
                                      <p className="text-slate-900 font-medium mb-1 text-sm">
                                          {resumeFile ? resumeFile.name : 'Click to upload or drag and drop'}
                                      </p>
                                      <p className="text-slate-500 text-xs">PDF, DOC, DOCX (Max 5MB)</p>
                                  </div>
                              </div>
                          </div>

                          {isProposalJob && (
                            <div className="space-y-4">
                              <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Proposal Details</h3>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Bid Amount</label>
                                  <input
                                    type="text"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors"
                                    placeholder="500"
                                    value={formData.bidAmount}
                                    onChange={e => setFormData({...formData, bidAmount: e.target.value})}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                                  <input
                                    type="text"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors"
                                    value={formData.bidCurrency}
                                    onChange={e => setFormData({...formData, bidCurrency: e.target.value.toUpperCase()})}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Timeline</label>
                                  <input
                                    type="text"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors"
                                    placeholder="2 weeks"
                                    value={formData.timelineEstimate}
                                    onChange={e => setFormData({...formData, timelineEstimate: e.target.value})}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Extra Portfolio Links</label>
                                <textarea
                                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors h-24 resize-none"
                                  placeholder="Add one link per line..."
                                  value={formData.portfolioLinks}
                                  onChange={e => setFormData({...formData, portfolioLinks: e.target.value})}
                                />
                              </div>
                              <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
                                <div className="flex items-start gap-3">
                                  <Sparkles className="w-5 h-5 text-brand-600 mt-1" />
                                  <div className="flex-1">
                                    <h4 className="font-bold text-slate-900">AI proposal helper</h4>
                                    <p className="text-sm text-slate-600 mt-1">Add notes about your experience, then ask AI to score your fit or draft proposal text. You still review and submit manually.</p>
                                    <textarea
                                      className="mt-4 w-full px-4 py-3 rounded-xl border border-brand-100 bg-surface focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors h-24 resize-none"
                                      placeholder="Paste relevant experience, project examples, or what you want the proposal to mention..."
                                      value={aiNotes}
                                      onChange={e => setAiNotes(e.target.value)}
                                    />
                                    <div className="mt-4 flex flex-wrap gap-3">
                                      <Button type="button" variant="outline" onClick={handleMatchScore} isLoading={isAiLoading}>
                                        <Sparkles className="w-4 h-4 mr-2" />
                                        Score Match
                                      </Button>
                                      <Button type="button" onClick={handleProposalDraft} isLoading={isAiLoading}>
                                        <FileText className="w-4 h-4 mr-2" />
                                        Draft Proposal
                                      </Button>
                                    </div>
                                    {aiMatchOutput && (
                                      <div className="mt-4 rounded-xl bg-surface border border-brand-100 p-4 text-sm leading-6 text-slate-700 whitespace-pre-line">
                                        {aiMatchOutput}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Cover Letter */}
                          <div className="space-y-4">
                              <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">{isProposalJob ? 'Written Proposal' : 'Cover Letter'}</h3>
                              <textarea 
                                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-colors h-40 resize-none"
                                  placeholder={isProposalJob ? "Explain your approach, relevant work, timeline, and why you're a good fit..." : "Tell us why you're a great fit for this role..."}
                                  value={isProposalJob ? formData.proposalText : formData.coverLetter}
                                  onChange={e => setFormData(isProposalJob ? {...formData, proposalText: e.target.value, coverLetter: e.target.value} : {...formData, coverLetter: e.target.value})}
                              ></textarea>
                          </div>

                          <div className="pt-6 flex items-center justify-end gap-4">
                              <Button type="button" variant="ghost" onClick={() => setApplicationStep('details')}>Cancel</Button>
                              <Button type="submit" isLoading={isSubmitting} className="px-8">{isProposalJob ? 'Submit Proposal' : 'Submit Application'}</Button>
                          </div>
                      </form>
                  </div>
              </div>
          </div>
      );
  }

  // Default View: Job Details
  return (
    <div className="min-h-screen bg-surface">
      {/* Header Image/Banner */}
      <div className="ag-static-dark h-40 sm:h-64 bg-slate-900 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
          <div className="absolute top-6 left-6">
              <button onClick={() => navigate('/jobs')} className="flex items-center text-white/80 hover:text-white transition-colors bg-black/20 backdrop-blur px-4 py-2 rounded-full text-sm">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Jobs
              </button>
          </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-32 relative z-10 pb-20">
          <div className="bg-surface rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
              <div className="p-5 sm:p-8 md:p-10 border-b border-slate-100">
                  <div className="flex flex-col md:flex-row gap-5 sm:gap-6 md:items-start">
                      <img src={job.logo} alt={`${job.company} logo`} className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm bg-surface" />
                      <div className="flex-1">
                          <h1 className="text-xl sm:text-2xl md:text-4xl font-bold text-slate-900 mb-2">{job.title}</h1>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm md:text-lg text-slate-600 font-medium mb-4 sm:mb-6">
                              <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" /> {job.company}</span>
                              <span className="hidden sm:inline w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" /> {job.location}</span>
                              <span className="hidden sm:inline w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" /> {job.type}</span>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 sm:gap-3">
                              <span className="px-3 py-1 bg-brand-50 text-brand-700 rounded-full text-xs sm:text-sm font-semibold">{job.category}</span>
                              <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs sm:text-sm font-semibold">Posted {job.postedAt}</span>
                          </div>
                      </div>
                      <div className="flex flex-col gap-2.5 sm:gap-3 min-w-[200px] w-full md:w-auto mt-4 md:mt-0">
                          <Button size="md" className="w-full shadow-lg shadow-brand-500/20 sm:h-12 sm:text-lg sm:px-6" onClick={() => setApplicationStep('form')}>
                            {isProposalJob ? 'Submit Proposal' : 'Apply Now'}
                          </Button>
                          <Button variant="outline" size="md" className="w-full sm:h-12 sm:text-lg sm:px-6">Save Job</Button>
                      </div>
                  </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3">
                  <div className="lg:col-span-2 p-5 sm:p-8 md:p-10 border-r border-slate-100">
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">About the Role</h3>
                      <div className="prose prose-slate max-w-none text-slate-600 text-sm sm:text-base leading-relaxed whitespace-pre-line">
                          {job.description}
                      </div>
                      
                      {(job.requirements?.length || job.responsibilities?.length) ? (
                        <div className="mt-8 pt-8 sm:mt-10 sm:pt-10 border-t border-slate-100 space-y-8 sm:space-y-10">
                          {job.requirements?.length ? (
                            <div>
                              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Requirements</h3>
                              <ul className="space-y-2.5 sm:space-y-3">
                                {job.requirements.map((req, i) => (
                                  <li key={i} className="flex items-start gap-2 sm:gap-3 text-slate-600 text-sm sm:text-base">
                                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 shrink-0 mt-0.5" />
                                    <span>{req}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {job.responsibilities?.length ? (
                            <div>
                              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Responsibilities</h3>
                              <ul className="space-y-2.5 sm:space-y-3">
                                {job.responsibilities.map((responsibility, i) => (
                                  <li key={i} className="flex items-start gap-2 sm:gap-3 text-slate-600 text-sm sm:text-base">
                                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-500 shrink-0 mt-0.5" />
                                    <span>{responsibility}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {job.skills?.length ? (
                        <div className="mt-8 pt-8 sm:mt-10 sm:pt-10 border-t border-slate-100">
                          <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Key Skills</h3>
                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            {job.skills.map((skill) => (
                              <span key={skill} className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-brand-50 text-brand-700 text-xs sm:text-sm font-semibold">
                                {skill}
                              </span>
                            ))}
                          </div>
                      </div>
                      ) : null}

                      {job.deliverables?.length ? (
                        <div className="mt-8 pt-8 sm:mt-10 sm:pt-10 border-t border-slate-100">
                          <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-4">Deliverables</h3>
                          <ul className="space-y-2.5 sm:space-y-3">
                            {job.deliverables.map((deliverable, i) => (
                              <li key={i} className="flex items-start gap-2 sm:gap-3 text-slate-600 text-sm sm:text-base">
                                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-brand-500 shrink-0 mt-0.5" />
                                <span>{deliverable}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                  </div>

                  <div className="bg-slate-50 p-5 sm:p-8 md:p-10">
                      <h3 className="font-bold text-slate-900 mb-4 sm:mb-6">Job Overview</h3>
                      <div className="space-y-4 sm:space-y-6">
                          <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Date Posted</p>
                              <p className="text-sm sm:text-base text-slate-900 font-semibold">{job.postedAt}</p>
                          </div>
                          <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Job Type</p>
                              <p className="text-sm sm:text-base text-slate-900 font-semibold">{job.type}</p>
                          </div>
                          <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Location</p>
                              <p className="text-sm sm:text-base text-slate-900 font-semibold">{job.location}</p>
                          </div>
                          <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Salary</p>
                              <p className="text-sm sm:text-base text-slate-900 font-semibold">{job.salaryRange || 'Shared during hiring process'}</p>
                          </div>
                          {formatBudget(job) ? (
                            <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">{isProposalJob ? 'Budget' : 'Compensation'}</p>
                              <p className="text-sm sm:text-base text-slate-900 font-semibold flex items-center gap-1.5">
                                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600" />
                                {formatBudget(job)}
                              </p>
                            </div>
                          ) : null}
                          {job.estimatedTimeline ? (
                            <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Timeline</p>
                              <p className="text-sm sm:text-base text-slate-900 font-semibold">{job.estimatedTimeline}</p>
                            </div>
                          ) : null}
                          {job.deadline ? (
                            <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Deadline</p>
                              <p className="text-sm sm:text-base text-slate-900 font-semibold">{new Date(job.deadline).toLocaleDateString()}</p>
                            </div>
                          ) : null}
                          {job.applyUrl ? (
                            <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">External application</p>
                              <a href={job.applyUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-600 font-semibold hover:underline">
                                Open application form
                              </a>
                            </div>
                          ) : null}
                          {job.companyWebsite ? (
                            <div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">Company website</p>
                              <a href={job.companyWebsite} target="_blank" rel="noreferrer" className="text-sm text-brand-600 font-semibold hover:underline">
                                Visit company site
                              </a>
                            </div>
                          ) : null}
                      </div>

                      <div className="mt-8 sm:mt-10 bg-surface p-5 rounded-2xl border border-slate-200 shadow-sm">
                          <h4 className="font-bold text-slate-900 mb-2">About {job.company}</h4>
                          <p className="text-xs sm:text-sm text-slate-500 mb-4 leading-relaxed">
                              {job.description || `Learn more about ${job.company} and the role before you apply.`}
                          </p>
                          {job.companyWebsite ? (
                            <a href={job.companyWebsite} target="_blank" rel="noreferrer" className="text-brand-600 font-bold text-xs sm:text-sm hover:underline">Visit Website</a>
                          ) : null}
                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};
