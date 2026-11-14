import type {
  QuizQuestion,
  CertificateData,
  SoloImprovementReport,
  Category,
  Topic,
  RevisionNote,
  QuestionExplanation,
} from '../types';

export const generateQuizQuestions = async (
  studentName: string,
  categories: Category[],
  questionCount: number,
  syllabusLevel: 'core' | 'extended',
  subject: 'physics' | 'biology' | 'chemistry',
  seed?: number
): Promise<QuizQuestion[]> => {
  // Sanitize categories to remove React node icons before sending JSON
  const payloadCategories = categories.map(c => ({
    name: c.name,
    topics: c.topics,
  }));

  const response = await fetch('/api/generate-quiz-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentName,
      categories: payloadCategories,
      questionCount,
      syllabusLevel,
      subject,
      seed,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with status ${response.status}`);
  }

  const data: QuizQuestion[] = await response.json();
  return data;
};

export const getCertificateData = async (
  studentName: string,
  correctAnswers: number,
  totalQuestions: number,
  topics: string[],
  subject: 'physics' | 'biology' | 'chemistry'
): Promise<CertificateData> => {
  const response = await fetch('/api/certificate-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentName,
      correctAnswers,
      totalQuestions,
      topics,
      subject,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with status ${response.status}`);
  }

  const data: CertificateData = await response.json();
  return data;
};

export const getSoloImprovementReport = async (
  studentName: string,
  correctAnswers: number,
  totalQuestions: number,
  topics: string[],
  subject: 'physics' | 'biology' | 'chemistry'
): Promise<SoloImprovementReport> => {
  const response = await fetch('/api/improvement-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentName,
      correctAnswers,
      totalQuestions,
      topics,
      subject,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with status ${response.status}`);
  }

  const data: SoloImprovementReport = await response.json();
  return data;
};

export const generateQuestionExplanation = async (
  question: QuizQuestion,
  incorrectAnswer: string
): Promise<QuestionExplanation> => {
  const response = await fetch('/api/explain-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      incorrectAnswer,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with status ${response.status}`);
  }

  const data: QuestionExplanation = await response.json();
  return data;
};

export const generateRevisionNotes = async (
  topic: Topic,
  subject: 'physics' | 'biology' | 'chemistry'
): Promise<RevisionNote[]> => {
  try {
    const response = await fetch('/api/revision-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, subject }),
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn("Failed to fetch from /api/revision-notes, generating structured notes", err);
  }

  // Resilient fallback generation from topic syllabus tree
  const subTopics = topic.subTopics || [{ name: topic.name, indicators: topic.indicators || [], isSupplement: topic.isSupplement }];
  return subTopics.map(st => ({
    subTopicHeading: st.name,
    isSupplement: st.isSupplement,
    points: (st.indicators && st.indicators.length > 0 ? st.indicators : [{ name: st.name, isSupplement: st.isSupplement }]).map(ind => ({
      concept: ind.name,
      isSupplement: ind.isSupplement,
      description: `<strong>${ind.name}</strong>: Core Cambridge IGCSE ${subject.toUpperCase()} Paper 2 competency for revision and examination.`,
      siUnit: 'N/A'
    }))
  }));
};

export const getFriendlyErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes('503') || message.includes('UNAVAILABLE') || message.includes('busy')) {
      return "The AI model is currently busy and could not generate the quiz. Please try again in a moment.";
    }
    return message;
  }
  return "An unexpected error occurred.";
};