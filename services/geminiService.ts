import type {
  QuizQuestion,
  CertificateData,
  SoloImprovementReport,
  Category,
  Topic,
  RevisionNote,
  QuestionExplanation,
} from '../types';

const QUIZ_CHUNK_SIZE = 3;
const MAX_CONCURRENT_CHUNKS = 4;

const fetchQuizChunk = async (
  payloadCategories: Array<{ name: string; topics: Topic[] }>,
  studentName: string,
  questionCount: number,
  syllabusLevel: 'core' | 'extended',
  subject: 'physics' | 'biology' | 'chemistry',
  seed: number,
  offset: number,
  limit: number,
  signal?: AbortSignal
): Promise<QuizQuestion[]> => {
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch('/api/generate-quiz-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        studentName,
        categories: payloadCategories,
        questionCount,
        syllabusLevel,
        subject,
        seed,
        offset,
        limit,
      }),
    });

    if (response.ok) {
      return await response.json();
    }

    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error || `Server responded with status ${response.status}`;

    // Do not retry client validation errors (4xx)
    if (response.status >= 400 && response.status < 500) {
      throw new Error(message);
    }

    if (attempt < maxAttempts - 1 && !signal?.aborted) {
      await new Promise(resolve => setTimeout(resolve, 400));
      continue;
    }

    throw new Error(message);
  }
  return [];
};

export const generateQuizQuestions = async (
  studentName: string,
  categories: Category[],
  questionCount: number,
  syllabusLevel: 'core' | 'extended',
  subject: 'physics' | 'biology' | 'chemistry',
  seed?: number,
  signal?: AbortSignal
): Promise<QuizQuestion[]> => {
  // Sanitize categories to remove React node icons before sending JSON
  const payloadCategories = categories.map(c => ({
    name: c.name,
    topics: c.topics,
  }));

  const effectiveSeed = typeof seed === 'number' ? seed : Math.floor(Math.random() * 1000000);
  const chunks: Array<{ offset: number; limit: number }> = [];
  for (let offset = 0; offset < questionCount; offset += QUIZ_CHUNK_SIZE) {
    chunks.push({
      offset,
      limit: Math.min(QUIZ_CHUNK_SIZE, questionCount - offset),
    });
  }

  const chunkResults: QuizQuestion[][] = new Array(chunks.length);
  let nextChunkIndex = 0;

  const runWorker = async () => {
    while (nextChunkIndex < chunks.length) {
      if (signal?.aborted) return;
      const idx = nextChunkIndex++;
      const { offset, limit } = chunks[idx];
      chunkResults[idx] = await fetchQuizChunk(
        payloadCategories,
        studentName,
        questionCount,
        syllabusLevel,
        subject,
        effectiveSeed,
        offset,
        limit,
        signal
      );
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_CHUNKS, chunks.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return chunkResults.flat().filter(Boolean);
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
    if (message.includes('504') || message.toLowerCase().includes('timeout')) {
      return "The request timed out while generating questions. Please try again or select fewer questions.";
    }
    return message;
  }
  return "An unexpected error occurred.";
};