import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, type QuizQuestion, type QuizResult, type SoloQuizConfig } from '../types';
import { generateQuizQuestions, getFriendlyErrorMessage, generateQuestionExplanation } from '../services/geminiService';
import { BIOLOGY_CATEGORIES, PHYSICS_CATEGORIES, CHEMISTRY_CATEGORIES, LOADING_MESSAGES } from '../constants';
import LoadingSpinner from './LoadingSpinner';
import MathText, { renderMathInHtml } from './MathText';

const Timer: React.FC<{ seconds: number }> = ({ seconds }) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return (
        <div className="text-2xl font-bold text-indigo-600 bg-white px-4 py-2 rounded-lg shadow">
            {String(minutes).padStart(2, '0')}:{String(remainingSeconds).padStart(2, '0')}
        </div>
    );
};

const QuizView: React.FC<{
    studentName: string;
    config: SoloQuizConfig;
    onComplete: (result: QuizResult) => void;
    onEndQuiz: () => void;
}> = ({ studentName, config, onComplete, onEndQuiz }) => {
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [score, setScore] = useState({ correct: 0, incorrect: 0 });
    const [isAnswered, setIsAnswered] = useState(false);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(config.timeLimit * 60);
    const [loadingMessage, setLoadingMessage] = useState("Generating your personalized quiz...");
    
    // State for explanations
    const [explanation, setExplanation] = useState<string | null>(null);
    const [isExplanationLoading, setIsExplanationLoading] = useState(false);

    const isCompletedRef = useRef(false);
    const isCancelledRef = useRef(false);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    const handleEndQuiz = useCallback(() => {
        isCancelledRef.current = true;
        isCompletedRef.current = true;
        onEndQuiz();
    }, [onEndQuiz]);
    
    const completeQuiz = useCallback((finalCorrect: number, finalIncorrect: number, totalQuestions: number) => {
        if (!isCompletedRef.current && !isCancelledRef.current) {
            isCompletedRef.current = true;
            onCompleteRef.current({
                correctAnswers: finalCorrect,
                incorrectAnswers: finalIncorrect,
                totalQuestions: totalQuestions,
                subject: config.subject,
            });
        }
    }, [config.subject]);

     useEffect(() => {
        if (loading) {
            const interval = setInterval(() => {
                setLoadingMessage(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [loading]);

    useEffect(() => {
        const fetchQuestions = async () => {
            setLoading(true);

            const allCategories = config.subject === 'biology' ? BIOLOGY_CATEGORIES : config.subject === 'chemistry' ? CHEMISTRY_CATEGORIES : PHYSICS_CATEGORIES;
            const selectedCategories = allCategories.filter(c => config.categories.includes(c.name));

            if (selectedCategories.length === 0) {
                const errorMessage = "No categories selected for the quiz. Please select different options.";
                setError(errorMessage);
                onCompleteRef.current({ correctAnswers: 0, incorrectAnswers: 0, totalQuestions: 0, error: true, errorMessage, subject: config.subject });
                setLoading(false);
                return;
            }

            try {
                const fetchedQuestions = await generateQuizQuestions(studentName, selectedCategories, config.questionCount, config.syllabusLevel, config.subject, config.seed);
                if (isCancelledRef.current) return;
                if (fetchedQuestions.length === 0) {
                    throw new Error("The AI failed to generate any questions for this topic. This can happen with very specific topic combinations. Please try again with different options.");
                }
                setQuestions(fetchedQuestions);
            } catch (err) {
                if (isCancelledRef.current) return;
                const friendlyMessage = getFriendlyErrorMessage(err);
                const fullErrorMessage = `Failed to start the quiz. ${friendlyMessage}`;
                setError(fullErrorMessage);
                if (!isCompletedRef.current) {
                    isCompletedRef.current = true;
                    onCompleteRef.current({ correctAnswers: 0, incorrectAnswers: 0, totalQuestions: 0, error: true, errorMessage: fullErrorMessage, subject: config.subject });
                }
            } finally {
                if (!isCancelledRef.current) {
                    setLoading(false);
                }
            }
        };
        fetchQuestions();
    }, [config, studentName]);

     useEffect(() => {
        if (!config.timerEnabled || loading || questions.length === 0) return;

        const timer = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timer);
                    const unanswered = questions.length - (score.correct + score.incorrect);
                    completeQuiz(score.correct, score.incorrect + unanswered, questions.length);
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [config.timerEnabled, loading, questions, score, completeQuiz]);

    const handleAnswer = (option: string) => {
        if (isAnswered) return;
        setIsAnswered(true);
        setSelectedOption(option);
    };

    const handleNextQuestion = () => {
        const isCorrect = selectedOption === questions[currentQuestionIndex].correctAnswer;
        const newScore = {
            correct: score.correct + (isCorrect ? 1 : 0),
            incorrect: score.incorrect + (isCorrect ? 0 : 1),
        };
        setScore(newScore);

        if (currentQuestionIndex + 1 >= questions.length) {
            completeQuiz(newScore.correct, newScore.incorrect, questions.length);
        } else {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            setIsAnswered(false);
            setSelectedOption(null);
            setExplanation(null);
            setIsExplanationLoading(false);
        }
    };

    const handleExplain = async () => {
        if (isExplanationLoading || explanation || !selectedOption) return;
        setIsExplanationLoading(true);
        try {
            const result = await generateQuestionExplanation(questions[currentQuestionIndex], selectedOption);
            setExplanation(result.explanation);
        } catch (e) {
            setExplanation("Could not load explanation at this moment.");
        } finally {
            setIsExplanationLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[16rem] py-8 gap-4">
                <LoadingSpinner />
                <p className="text-lg text-gray-600 text-center max-w-md">{loadingMessage}</p>
                <button
                    type="button"
                    onClick={handleEndQuiz}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                    End Quiz
                </button>
            </div>
        );
    }
    if (error) {
        return (
            <div className="text-center space-y-4 py-8">
                <p className="text-red-500 text-lg">{error}</p>
                <button
                    type="button"
                    onClick={handleEndQuiz}
                    className="px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                    Back to Home
                </button>
            </div>
        );
    }
    if (questions.length === 0 && !loading) {
        return (
            <div className="text-center space-y-4 py-8">
                <p className="text-gray-600 text-lg">No questions available.</p>
                <button
                    type="button"
                    onClick={handleEndQuiz}
                    className="px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                    Back to Home
                </button>
            </div>
        );
    }

    const currentQuestion = questions[currentQuestionIndex];
    const questionNumber = currentQuestionIndex + 1;

    return (
        <div className="max-w-3xl mx-auto p-4 md:p-8 bg-white rounded-2xl shadow-2xl">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
                <div className="flex items-center gap-4 text-base sm:text-xl font-semibold text-gray-700 tabular-nums">
                    <span>Correct: <span className="text-green-600">{score.correct}</span></span>
                    <span>Incorrect: <span className="text-red-500">{score.incorrect}</span></span>
                </div>
                <div className="flex items-center gap-3">
                    {config.timerEnabled && <Timer seconds={timeLeft} />}
                    <button
                        type="button"
                        onClick={handleEndQuiz}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title="End quiz and return to home page"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>End Quiz</span>
                    </button>
                </div>
            </div>

            <div className="mb-4 flex flex-wrap justify-between items-center gap-2 border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2 text-xs md:text-sm font-medium text-slate-500">
                    {currentQuestion.syllabusRef && (
                        <span className="font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-100">
                            {currentQuestion.syllabusRef}
                        </span>
                    )}
                    {currentQuestion.questionType && (
                        <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                            currentQuestion.questionType === 'calculation' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            currentQuestion.questionType === 'conceptual' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                            currentQuestion.questionType === 'experimental' ? 'bg-teal-50 text-teal-800 border border-teal-200' :
                            currentQuestion.questionType === 'graph' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                            currentQuestion.questionType === 'sequencing' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                            'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                            {currentQuestion.questionType === 'calculation' ? 'Quantitative Calculation' :
                             currentQuestion.questionType === 'conceptual' ? 'Conceptual Reasoning' :
                             currentQuestion.questionType === 'experimental' ? 'Instrument & Experimental' :
                             currentQuestion.questionType === 'graph' ? 'Graph & Waveform' :
                             currentQuestion.questionType === 'sequencing' ? 'Process Sequencing' : 'Direct Recall'}
                        </span>
                    )}
                </div>
                <div className="text-right text-xs md:text-sm font-medium text-gray-500">
                    <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded mr-2">Cambridge P2</span>
                    Question {questionNumber} of {questions.length}
                </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg mb-6 min-h-[100px] border border-gray-200">
                <h2 className="text-xl md:text-2xl font-medium text-gray-800 leading-relaxed break-words">
                    <MathText text={currentQuestion.question} />
                </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option) => {
                    const isCorrectOption = option === currentQuestion.correctAnswer;
                    const isSelectedOption = option === selectedOption;
                    let buttonClass = 'bg-white border-gray-300 hover:bg-indigo-50 hover:border-indigo-400 text-gray-800';
                    if (isAnswered) {
                         if (isCorrectOption) {
                            buttonClass = 'bg-green-500 border-green-500 text-white transform scale-105';
                        } else if (isSelectedOption) {
                            buttonClass = 'bg-red-500 border-red-500 text-white';
                        } else {
                            buttonClass = 'bg-white border-gray-300 opacity-60 text-gray-700';
                        }
                    }
                    return (
                        <button
                            key={option}
                            onClick={() => handleAnswer(option)}
                            disabled={isAnswered}
                            className={`p-4 rounded-lg border-2 text-lg text-left leading-relaxed break-words transition-all duration-300 ${buttonClass}`}
                        >
                            <MathText text={option} />
                        </button>
                    );
                })}
            </div>

            {isAnswered && (
                <div className="mt-6 space-y-4">
                    {/* Cambridge/Edexcel Marking Scheme */}
                    {currentQuestion.markingScheme && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-left text-emerald-950">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-bold text-sm text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Official Marking Scheme
                                </span>
                                <span className="text-xs font-bold bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded">
                                    [{currentQuestion.markingScheme.marks || 1} {currentQuestion.markingScheme.marks === 1 ? 'Mark' : 'Marks'}]
                                </span>
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-sm text-emerald-900 pl-1">
                                {currentQuestion.markingScheme.breakdown?.map((item, idx) => (
                                    <li key={idx} className="leading-relaxed">
                                        <MathText text={item} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* 1-Sentence Exam Trap Tip */}
                    {currentQuestion.examTip && (
                        <div className="p-3.5 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg text-left text-amber-900 text-sm flex items-start gap-2.5">
                            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <div>
                                <span className="font-bold text-amber-950">Exam Trap Tip: </span>
                                <MathText text={currentQuestion.examTip} />
                            </div>
                        </div>
                    )}

                    <div className="text-center pt-2">
                        {selectedOption !== currentQuestion.correctAnswer && !explanation && (
                             <button 
                                onClick={handleExplain} 
                                disabled={isExplanationLoading}
                                className="mb-4 px-4 py-2 bg-amber-100 text-amber-800 font-semibold rounded-lg hover:bg-amber-200 transition flex items-center justify-center mx-auto disabled:opacity-50 disabled:cursor-wait text-sm"
                            >
                                 {isExplanationLoading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-amber-800 border-t-transparent rounded-full animate-spin mr-2"></div>
                                        <span>Generating Explanation...</span>
                                    </>
                                 ) : (
                                    <>
                                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M10 2a6 6 0 00-6 6c0 1.887 1.12 3.535 2.75 4.312A5.01 5.01 0 0110 10c1.66 0 3.09.81 4.02 2.016a4.99 4.99 0 01-.32-1.258A4.002 4.002 0 0010 8a1 1 0 01-1-1 1 1 0 00-2 0 3 3 0 013 3 1 1 0 102 0 4.002 4.002 0 00-2.096-3.588 6.002 6.002 0 004.85-2.06A6 6 0 0010 2z"/>
                                            <path d="M12.243 14.243a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414l-3-3a1 1 0 01.707-1.707z"/>
                                         </svg>
                                        <span>Deep Dive: Explain Answer</span>
                                    </>
                                 )}
                            </button>
                        )}

                        {explanation && (
                            <div className="my-4 p-4 bg-amber-50 border-l-4 border-amber-400 text-amber-900 text-left rounded-r-lg transition-opacity duration-500 animate-fade-in text-sm">
                                <h4 className="font-bold mb-1">Detailed Explanation</h4>
                                <div className="math-text-root leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMathInHtml(explanation) }} />
                            </div>
                        )}
                        
                        <button 
                            onClick={handleNextQuestion} 
                            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition cursor-pointer"
                        >
                            {currentQuestionIndex === questions.length - 1
                                ? Math.round(((score.correct + (selectedOption === currentQuestion.correctAnswer ? 1 : 0)) / questions.length) * 100) >= 61
                                    ? 'Finish Quiz & View Certificate'
                                    : 'Finish Quiz & View Report'
                                : 'Next Question'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const TierSeal: React.FC<{ type: 'Gold' | 'Silver' | 'Bronze' }> = ({ type }) => {
    const theme = {
        Gold: { sealColor: 'bg-amber-400', ringColor: 'ring-amber-200' },
        Silver: { sealColor: 'bg-slate-400', ringColor: 'ring-slate-200' },
        Bronze: { sealColor: 'bg-orange-400', ringColor: 'ring-orange-200' },
    };
    const { sealColor, ringColor } = theme[type];

    return (
        <div className={`w-20 h-20 rounded-full ${sealColor} flex items-center justify-center shadow-lg ring-4 ${ringColor}`}>
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z" />
            </svg>
        </div>
    );
};

const CertificateView: React.FC<{
    studentName: string;
    result: QuizResult;
    onReset: () => void;
}> = ({ studentName, result, onReset }) => {
    const certRef = useRef<HTMLDivElement>(null);
    const certData = result.certificateData;
    const loading = !certData;
    
    const accuracy = result.totalQuestions > 0 ? (result.correctAnswers / result.totalQuestions) * 100 : 0;
    const roundedAccuracy = Math.round(accuracy);
    
    const getTier = (acc: number): 'Gold' | 'Silver' | 'Bronze' => {
        if (acc >= 81) return 'Gold';
        if (acc >= 71) return 'Silver';
        return 'Bronze';
    };
    const tier = getTier(roundedAccuracy);

    const theme = {
        Gold: { borderColor: 'border-amber-300', bgColor: 'bg-amber-100', textColor: 'text-amber-800' },
        Silver: { borderColor: 'border-slate-300', bgColor: 'bg-slate-100', textColor: 'text-slate-800' },
        Bronze: { borderColor: 'border-orange-300', bgColor: 'bg-orange-100', textColor: 'text-orange-800' },
    };
    const { borderColor, bgColor, textColor } = theme[tier];
    const subjectTitle = result.subject ? result.subject.charAt(0).toUpperCase() + result.subject.slice(1) : "Science";


    const [shareToast, setShareToast] = useState<string | null>(null);

    const handleShare = async () => {
        const shareText = `🎓 I scored ${roundedAccuracy}% on Cambridge IGCSE ${subjectTitle} Paper 2 with Science Helper!`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Cambridge IGCSE Certificate - ${studentName}`,
                    text: shareText,
                    url: window.location.href,
                });
                setShareToast("Shared successfully!");
                setTimeout(() => setShareToast(null), 3000);
                return;
            } catch (err) {
                // User cancelled or unsupported
            }
        }
        if (navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(shareText);
            } catch (err) {
                // Ignore clipboard failures
            }
        }
        setShareToast("📸 Take a screenshot of your certificate to share! (Summary copied to clipboard)");
        setTimeout(() => setShareToast(null), 4000);
    };

    return (
        <div className="max-w-md mx-auto p-2 sm:p-4 flex flex-col items-center space-y-4">
            <div ref={certRef} className="relative pt-12 pb-8 px-6 bg-white rounded-lg shadow-2xl w-full text-center overflow-hidden">
                <div className={`absolute top-0 left-0 w-24 h-24 border-t-8 border-l-8 ${borderColor} rounded-tl-lg`}></div>
                <div className={`absolute bottom-0 right-0 w-24 h-24 border-b-8 border-r-8 ${borderColor} rounded-br-lg`}></div>

                <div className="relative z-10">
                    <div className="flex justify-center mb-4">
                        <TierSeal type={tier} />
                    </div>
                    
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500">Certificate of Achievement</h2>
                    <p className="text-gray-600 mt-4">This certificate is awarded to</p>
                    
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-gray-800 my-2 break-words">
                        {studentName}
                    </h1>

                    <p className="text-gray-600">
                        for demonstrating outstanding knowledge in IGCSE {subjectTitle} Paper 2.
                    </p>
                    
                    <div className={`my-6 inline-block px-4 py-2 ${bgColor} ${textColor} rounded-full font-semibold text-sm`}>
                        {tier} Tier &bull; {roundedAccuracy}% Score ({result.correctAnswers}/{result.totalQuestions} Marks)
                    </div>

                    {loading ? <div className="py-4"><LoadingSpinner/></div> : (
                        <div className="text-left space-y-2 mt-4 bg-gray-50 p-4 rounded-md border border-gray-200">
                             <h4 className="font-bold text-sm text-gray-700">Performance Summary:</h4>
                             <p className="text-gray-600 text-sm">{certData?.summary}</p>
                             <h4 className="font-bold text-sm text-gray-700 mt-2">Assessed Syllabus Topics:</h4>
                             <p className="text-gray-600 text-sm">{result.categories?.join(', ')}</p>
                        </div>
                    )}
                    
                    <div className="mt-8 flex justify-between items-center text-xs text-gray-500">
                        <span>Date: {new Date().toLocaleDateString()}</span>
                        <span className="font-bold">Cambridge IGCSE Science Helper</span>
                    </div>
                </div>
            </div>

            {shareToast && (
                <div className="w-full p-3 bg-indigo-900 text-white text-xs sm:text-sm rounded-lg shadow-lg text-center flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{shareToast}</span>
                </div>
            )}

            <div className="text-center p-4 w-full flex flex-wrap justify-center items-center gap-3">
                <button
                    onClick={handleShare}
                    className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold rounded-lg shadow-md hover:from-indigo-700 hover:to-blue-700 transition flex items-center gap-2 text-sm cursor-pointer"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take screenshot and share
                </button>
                <button
                    onClick={onReset}
                    className="px-6 py-2.5 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition text-sm cursor-pointer"
                >
                    Back to Home
                </button>
            </div>
        </div>
    );
};

const ImprovementReportView: React.FC<{
    studentName: string;
    result: QuizResult;
    onReset: () => void;
}> = ({ studentName, result, onReset }) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const report = result.improvementReport;
    const loading = !report;
    const subjectTitle = result.subject ? result.subject.charAt(0).toUpperCase() + result.subject.slice(1) : "Science";

    const accuracy = result.totalQuestions > 0 ? (result.correctAnswers / result.totalQuestions) * 100 : 0;

    return (
        <div className="max-w-sm mx-auto p-2 flex flex-col items-center space-y-4">
            <div ref={reportRef} className="p-6 bg-white rounded-lg shadow-xl text-center border-t-4 border-indigo-500 w-full">
                <h2 className="text-2xl font-bold text-gray-800">Quiz Report - IGCSE {subjectTitle}</h2>
                <p className="text-sm text-gray-500 mt-1">for <span className="font-semibold">{studentName}</span></p>
                
                <div className="my-6 text-center">
                    <p className="text-5xl font-bold text-red-500">{accuracy.toFixed(0)}<span className="text-3xl">%</span></p>
                    <p className="text-gray-600 text-sm mt-1">Score ({result.correctAnswers} / {result.totalQuestions} correct)</p>
                </div>

                <div className="my-4 text-xs text-center text-gray-500">
                    <p className="font-bold">Topics:</p>
                    <p>{result.categories?.join(', ')}</p>
                </div>

                {loading ? <div className="my-6"><LoadingSpinner /></div> : (
                    <div className="text-left my-6 bg-indigo-50 p-4 rounded-md border-l-4 border-indigo-400">
                        <h4 className="font-bold text-md text-indigo-800">Focus Areas for Improvement:</h4>
                        <ul className="list-disc list-inside mt-2 text-indigo-900 space-y-1 text-sm">
                            {report?.improvementAreas.map((area, i) => <li key={i}>{area}</li>)}
                        </ul>
                        <p className="italic text-indigo-900 mt-4 text-sm">"{report?.motivationalMessage}"</p>
                    </div>
                )}
                <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
                    <span>{new Date().toLocaleDateString()}</span>
                    <span className="font-bold">Science Helper</span>
                </div>
            </div>
            <div className="text-center p-2">
                <button onClick={onReset} className="mt-2 px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition text-sm">Try Again</button>
            </div>
        </div>
    );
};

interface QuizFlowProps {
  initialView: View;
  studentName: string;
  quizConfig: SoloQuizConfig;
  quizResult: QuizResult | null;
  onQuizComplete: (result: QuizResult) => void;
  onReset: () => void;
}

const QuizFlow: React.FC<QuizFlowProps> = ({ initialView, studentName, quizConfig, quizResult, onQuizComplete, onReset }) => {
    const accuracy = quizResult && quizResult.totalQuestions > 0 ? (quizResult.correctAnswers / quizResult.totalQuestions) * 100 : 0;
    const hasCertificate = quizResult && Math.round(accuracy) >= 61 && !quizResult.error;

    switch (initialView) {
        case View.QUIZ:
            return <QuizView studentName={studentName} config={quizConfig} onComplete={onQuizComplete} onEndQuiz={onReset} />;
        case View.CERTIFICATE:
            if (!quizResult) {
                return <p>An error occurred displaying the results.</p>;
            }
             if (quizResult.error) {
                 return <div className="text-center"><p className="text-red-500 text-lg mb-4">{quizResult.errorMessage || "We're sorry, but an error occurred while generating your quiz."}</p><button onClick={onReset} className="px-6 py-3 bg-indigo-600 text-white rounded-lg">Back to Home</button></div>;
            }
            return hasCertificate 
                ? <CertificateView studentName={studentName} result={quizResult} onReset={onReset} />
                : <ImprovementReportView studentName={studentName} result={quizResult} onReset={onReset} />;
        default:
            return null;
    }
};

export default QuizFlow;
