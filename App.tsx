import React, { useState, useCallback, useRef } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import Layout from './components/Layout';
import MainView from './components/MainView';
import QuizFlow from './components/QuizFlow';
import type { QuizResult, SoloQuizConfig } from './types';
import { View } from './types';
import { getCertificateData, getSoloImprovementReport } from './services/geminiService';

const App: React.FC = () => {
  const [view, setView] = useState<View>(View.MAIN);
  const [studentName, setStudentName] = useState<string>('');
  
  // Unified Quiz State
  const [quizConfig, setQuizConfig] = useState<SoloQuizConfig | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const sessionIdRef = useRef(0);

  const startQuiz = useCallback((name: string, config: SoloQuizConfig) => {
    sessionIdRef.current += 1;
    setStudentName(name);
    setQuizConfig(config);
    setQuizResult(null);
    setView(View.QUIZ);
  }, []);

  const showResults = useCallback(async (result: QuizResult) => {
    if (!quizConfig) return;
    const activeSessionId = sessionIdRef.current;
    const accuracy = result.totalQuestions > 0 ? (result.correctAnswers / result.totalQuestions) * 100 : 0;
    const roundedAccuracy = Math.round(accuracy);
    const hasCertificate = roundedAccuracy >= 61 && !result.error;

    const initialResult: QuizResult = {
      ...result,
      categories: quizConfig.categories,
      subject: quizConfig.subject,
    };

    // Transition immediately to the Certificate / Report view so the user sees results right away
    setQuizResult(initialResult);
    setView(View.CERTIFICATE);

    if (result.error) return;

    try {
      if (hasCertificate) {
        const data = await getCertificateData(
          studentName,
          initialResult.correctAnswers,
          initialResult.totalQuestions,
          quizConfig.categories,
          quizConfig.subject
        );
        if (sessionIdRef.current === activeSessionId) {
          setQuizResult(prev => (prev ? { ...prev, certificateData: data } : prev));
        }
      } else {
        const report = await getSoloImprovementReport(
          studentName,
          initialResult.correctAnswers,
          initialResult.totalQuestions,
          quizConfig.categories,
          quizConfig.subject
        );
        if (sessionIdRef.current === activeSessionId) {
          setQuizResult(prev => (prev ? { ...prev, improvementReport: report } : prev));
        }
      }
    } catch (e) {
      console.error("Failed to fetch certificate/report data:", e);
      if (sessionIdRef.current !== activeSessionId) return;
      if (hasCertificate) {
        setQuizResult(prev =>
          prev
            ? {
                ...prev,
                certificateData: {
                  summary:
                    "Could not load performance summary due to a network issue, but your score is certified. Congratulations on your achievement!",
                },
              }
            : prev
        );
      } else {
        setQuizResult(prev =>
          prev
            ? {
                ...prev,
                improvementReport: {
                  improvementAreas: ["Could not load specific improvement areas due to a network issue."],
                  motivationalMessage: "Every attempt is a step forward. Keep practicing and you'll master it!",
                },
              }
            : prev
        );
      }
    }
  }, [quizConfig, studentName]);

  const resetApp = useCallback(() => {
    sessionIdRef.current += 1;
    setView(View.MAIN);
    setStudentName('');
    setQuizConfig(null);
    setQuizResult(null);
  }, []);

  const renderContent = () => {
    switch (view) {
      case View.QUIZ:
      case View.CERTIFICATE:
        return (
          <QuizFlow
            initialView={view}
            studentName={studentName}
            quizConfig={quizConfig!}
            onQuizComplete={showResults}
            quizResult={quizResult}
            onReset={resetApp}
          />
        );
      case View.MAIN:
      default:
        return <MainView onStartQuiz={startQuiz} />;
    }
  };

  return (
    <Layout onHomeClick={resetApp}>
      {renderContent()}
      <SpeedInsights />
    </Layout>
  );
};

export default App;
