import React, { useState, useEffect } from 'react';
import { PHYSICS_CATEGORIES, BIOLOGY_CATEGORIES, CHEMISTRY_CATEGORIES, SCIENCE_HELPER_INSIGHTS } from '../constants';
import type { SoloQuizConfig, ScienceHelperInsight } from '../types';
import CertificateShowcase from './CertificateShowcase';
import MathText from './MathText';

const AssistantMessage: React.FC<{
    insight: ScienceHelperInsight;
    currentIndex: number;
    totalCount: number;
    onNext: () => void;
}> = ({ insight, currentIndex, totalCount, onNext }) => (
    <div className="p-5 bg-indigo-50/70 border border-indigo-200 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-base font-bold text-indigo-950 truncate">Message from Science Helper</h3>
            </div>
            <button
                type="button"
                onClick={onNext}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 px-2.5 py-1 rounded-md hover:bg-indigo-100/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Show next fact or definition"
            >
                Next &rarr;
            </button>
        </div>

        <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-indigo-700">
                <span>{insight.subject}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{insight.kind}</span>
                <span aria-hidden="true">&middot;</span>
                <span className="tabular-nums text-indigo-500">{currentIndex + 1}/{totalCount}</span>
            </div>
            <p className="text-sm font-bold text-indigo-950 leading-snug">
                {insight.title}
            </p>
            <p className="text-sm text-indigo-900/90 leading-relaxed">
                <MathText text={insight.body} />
            </p>
        </div>
    </div>
);

interface MainViewProps {
    onStartQuiz: (name: string, config: SoloQuizConfig) => void;
}

const MainView: React.FC<MainViewProps> = ({ onStartQuiz }) => {
    const [subject, setSubject] = useState<'physics' | 'biology' | 'chemistry'>('physics');
    
    // Solo state
    const [studentName, setStudentName] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [syllabusLevel, setSyllabusLevel] = useState<'core' | 'extended'>('extended');
    const [soloQuizConfig, setSoloQuizConfig] = useState<Omit<SoloQuizConfig, 'categories' | 'seed' | 'syllabusLevel' | 'subject'>>({
        questionCount: 15,
        timerEnabled: true,
        timeLimit: 15
    });
    
    // Rotating Science Helper insights across Physics, Chemistry, and Biology
    const [shuffledInsights] = useState<ScienceHelperInsight[]>(() => {
        const copy = [...SCIENCE_HELPER_INSIGHTS];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    });
    const [insightIndex, setInsightIndex] = useState(0);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setInsightIndex(prev => (prev + 1) % shuffledInsights.length);
        }, 8000);
        return () => clearTimeout(timer);
    }, [insightIndex, shuffledInsights.length]);

    const handleNextInsight = () => {
        setInsightIndex(prev => (prev + 1) % shuffledInsights.length);
    };

    const ALL_CATEGORIES = subject === 'biology' ? BIOLOGY_CATEGORIES : subject === 'chemistry' ? CHEMISTRY_CATEGORIES : PHYSICS_CATEGORIES;

    // Select all categories by default when switching subject or first load
    useEffect(() => {
        setSelectedCategories(ALL_CATEGORIES.map(c => c.name));
    }, [subject]);

    const handleSubjectChange = (newSubject: 'physics' | 'biology' | 'chemistry') => {
        if (subject !== newSubject) {
            setSubject(newSubject);
            setFormError('');
        }
    };

    const handleSelectAllCategories = () => {
        setSelectedCategories(ALL_CATEGORIES.map(c => c.name));
    };

    const handleDeselectAllCategories = () => {
        setSelectedCategories([]);
    };

    const handleStartSoloQuizClick = () => {
        setFormError('');
        if (studentName.trim() && selectedCategories.length > 0) {
            const config: SoloQuizConfig = { ...soloQuizConfig, categories: selectedCategories, syllabusLevel, subject };
            onStartQuiz(studentName.trim(), config);
        } else {
            setFormError("Please enter your name and select at least one syllabus topic.");
        }
    };

    const subjectTitle = subject.charAt(0).toUpperCase() + subject.slice(1);
    const syllabusCode = subject === 'physics' ? '0625' : subject === 'biology' ? '0610' : '0620';

    const subjectButtonClass = (buttonSubject: 'physics' | 'biology' | 'chemistry') => 
        `px-3.5 py-1.5 rounded-lg font-bold text-xs transition-colors duration-200 focus:outline-hidden ${
            subject === buttonSubject 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'text-gray-600 hover:bg-gray-100'
        }`;

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-5 md:p-6 border-b border-gray-100 bg-white">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                                <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Cambridge IGCSE 2026–2028</span>
                            </div>
                            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mt-1">
                                {subjectTitle} Paper 2 Exam Simulator
                            </h2>
                        </div>
                        <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
                            <button onClick={() => handleSubjectChange('physics')} className={subjectButtonClass('physics')}>Physics (0625)</button>
                            <button onClick={() => handleSubjectChange('biology')} className={subjectButtonClass('biology')}>Biology (0610)</button>
                            <button onClick={() => handleSubjectChange('chemistry')} className={subjectButtonClass('chemistry')}>Chemistry (0620)</button>
                        </div>
                    </div>
                </div>

                <div className="p-4 md:p-6">
                    <div className="space-y-6">
                        <div className="text-center space-y-1">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                                Official Cambridge IGCSE {syllabusCode} Format
                            </span>
                            <h3 className="text-2xl font-extrabold text-gray-900">
                                Configure Your Exam Challenge
                            </h3>
                            <p className="text-gray-600 text-sm max-w-xl mx-auto">
                                Practice realistic Cambridge multiple-choice questions with authentic marking scheme criteria, examiner tips, and certified achievement awards.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                            <div className="md:col-span-2 min-w-0 space-y-6">
                                <div className="space-y-6 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
                                    <div>
                                        <label htmlFor="studentName" className="block text-sm font-bold text-gray-700 mb-1.5">
                                            Candidate Name (for Certificate):
                                        </label>
                                        <input
                                            id="studentName"
                                            type="text"
                                            value={studentName}
                                            onChange={(e) => setStudentName(e.target.value)}
                                            placeholder="e.g., Albert Einstein"
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white text-base"
                                        />
                                    </div>
                                    
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-bold text-gray-700">Select Exam Topics:</p>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleSelectAllCategories}
                                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                                >
                                                    Select All
                                                </button>
                                                <span className="text-gray-300">|</span>
                                                <button
                                                    type="button"
                                                    onClick={handleDeselectAllCategories}
                                                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 cursor-pointer"
                                                >
                                                    Clear All
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200 max-h-72 overflow-y-auto">
                                            {ALL_CATEGORIES.map(category => {
                                                const isSelected = selectedCategories.includes(category.name);
                                                return (
                                                    <label
                                                        key={category.name}
                                                        htmlFor={`category-${category.name}`}
                                                        className={`flex items-start p-2.5 rounded-lg border transition-all cursor-pointer ${
                                                            isSelected
                                                                ? 'bg-white border-indigo-300 shadow-2xs'
                                                                : 'bg-transparent border-transparent hover:bg-gray-100 text-gray-600'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            id={`category-${category.name}`}
                                                            checked={isSelected}
                                                            onChange={() => setSelectedCategories(prev =>
                                                                prev.includes(category.name)
                                                                    ? prev.filter(c => c !== category.name)
                                                                    : [...prev, category.name]
                                                            )}
                                                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <span className="ml-2.5 text-xs font-medium text-gray-800 leading-snug">
                                                            {category.name}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                        <div className="min-w-0">
                                            <label htmlFor="questionCount" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Question Count:
                                            </label>
                                            <select
                                                id="questionCount"
                                                value={soloQuizConfig.questionCount}
                                                onChange={e => setSoloQuizConfig(c => ({...c, questionCount: Number(e.target.value)}))}
                                                className="w-full min-w-0 truncate px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm font-semibold"
                                            >
                                                <option value={5}>5 Questions (Rapid-Fire)</option>
                                                <option value={10}>10 Questions (Quick Practice)</option>
                                                <option value={15}>15 Questions (Standard Practice)</option>
                                                <option value={20}>20 Questions (Extended Drill)</option>
                                                <option value={30}>30 Questions (Full Paper Prep)</option>
                                                <option value={40}>40 Questions (Authentic P2 Mock)</option>
                                            </select>
                                        </div>
                                        <div className="min-w-0">
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                Exam Timer:
                                            </label>
                                            <div className="flex items-center gap-3 min-w-0">
                                                <label className="flex items-center shrink-0 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={soloQuizConfig.timerEnabled}
                                                        onChange={e => setSoloQuizConfig(c => ({...c, timerEnabled: e.target.checked}))}
                                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="ml-2 text-xs font-semibold text-gray-700">Timed</span>
                                                </label>
                                                {soloQuizConfig.timerEnabled && (
                                                    <select
                                                        value={soloQuizConfig.timeLimit}
                                                        onChange={e => setSoloQuizConfig(c => ({...c, timeLimit: Number(e.target.value)}))}
                                                        className="flex-1 min-w-0 w-full truncate px-3 py-2 bg-white border border-gray-300 rounded-lg shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm"
                                                    >
                                                        <option value={5}>5 mins</option>
                                                        <option value={10}>10 mins</option>
                                                        <option value={15}>15 mins</option>
                                                        <option value={25}>25 mins</option>
                                                        <option value={45}>45 mins (Official P2 Time)</option>
                                                    </select>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Syllabus Level:
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition ${
                                                syllabusLevel === 'extended' ? 'bg-indigo-50 border-indigo-400 text-indigo-900' : 'bg-white border-gray-200 text-gray-700'
                                            }`}>
                                                <input
                                                    type="radio"
                                                    name="syllabusLevelSolo"
                                                    value="extended"
                                                    checked={syllabusLevel === 'extended'}
                                                    onChange={() => setSyllabusLevel('extended')}
                                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                                />
                                                <div className="ml-2.5">
                                                    <span className="block text-sm font-bold">Extended (Grades 9–1 / A*–G)</span>
                                                    <span className="block text-xs text-gray-500">Includes Core + Supplement topics</span>
                                                </div>
                                            </label>

                                            <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition ${
                                                syllabusLevel === 'core' ? 'bg-teal-50 border-teal-400 text-teal-900' : 'bg-white border-gray-200 text-gray-700'
                                            }`}>
                                                <input
                                                    type="radio"
                                                    name="syllabusLevelSolo"
                                                    value="core"
                                                    checked={syllabusLevel === 'core'}
                                                    onChange={() => setSyllabusLevel('core')}
                                                    className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300"
                                                />
                                                <div className="ml-2.5">
                                                    <span className="block text-sm font-bold">Core Only (Grades 5–1 / C–G)</span>
                                                    <span className="block text-xs text-gray-500">Core foundational content only</span>
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                    {formError && (
                                        <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm font-medium rounded-r-lg">
                                            {formError}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleStartSoloQuizClick}
                                        disabled={!studentName.trim() || selectedCategories.length === 0}
                                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-extrabold text-lg rounded-xl shadow-md hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                                    >
                                        Start Exam Simulator
                                    </button>
                                </div>
                            </div>

                            <div className="md:col-span-1 min-w-0 space-y-6">
                                <CertificateShowcase />
                                <AssistantMessage
                                    insight={shuffledInsights[insightIndex]}
                                    currentIndex={insightIndex}
                                    totalCount={shuffledInsights.length}
                                    onNext={handleNextInsight}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default MainView;
