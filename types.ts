import React from 'react';

export interface Indicator {
  name: string;
  isSupplement?: boolean;
}

export interface SubTopic {
  name: string;
  indicators: Indicator[];
  isSupplement?: boolean;
}

export interface Topic {
  name: string;
  isSupplement?: boolean;
  indicators?: Indicator[];
  subTopics?: SubTopic[];
}

export interface Category {
  name: string;
  icon: React.ReactNode;
  topics: Topic[];
}

export interface MarkingScheme {
  marks: number;
  breakdown: string[];
}

export interface QuizQuestion {
  questionId?: string;
  syllabusRef?: string;
  questionType?: 'recall' | 'calculation' | 'conceptual' | 'sequencing' | 'experimental' | 'graph';
  question: string;
  options: string[];
  correctAnswer: string;
  markingScheme?: MarkingScheme;
  examTip?: string;
}

export interface SoloQuizConfig {
    questionCount: number;
    timerEnabled: boolean;
    timeLimit: number; // in minutes
    categories: string[];
    subject: 'physics' | 'biology' | 'chemistry';
    syllabusLevel: 'core' | 'extended';
    seed?: number;
    organizerName?: string;
    challengeTitle?: string;
    challengeCode?: string;
}

export interface QuizResult {
  correctAnswers: number;
  incorrectAnswers: number;
  totalQuestions: number;
  error?: boolean;
  errorMessage?: string;
  certificateData?: CertificateData;
  improvementReport?: SoloImprovementReport;
  categories?: string[];
  subject?: 'physics' | 'biology' | 'chemistry';
}

export interface CertificateData {
    summary: string;
}

export interface SoloImprovementReport {
    improvementAreas: string[];
    motivationalMessage: string;
}

export interface FormulaVariation {
  variable: string;
  expression: string;
  siUnit: string;
}

export interface RevisionPoint {
  concept?: string;
  syllabusIndicatorRef?: string;
  isSupplement?: boolean;
  description: string;
  formula?: string;
  formulaVariations?: FormulaVariation[];
  symbolExplanation?: string;
  siUnit?: string;
  examKeywords?: string[];
  examTip?: string;
  tableData?: {
    headers: string[];
    rows: string[][];
  };
}

export interface RevisionNote {
  subTopicHeading: string;
  isSupplement?: boolean;
  syllabusRef?: string;
  points: RevisionPoint[];
}

export interface QuestionExplanation {
    explanation: string;
}

export interface ScienceHelperInsight {
  subject: 'Physics' | 'Chemistry' | 'Biology';
  kind: 'Key Definition' | 'Science Fact';
  title: string;
  body: string;
}

export enum View {
  MAIN = 'main',
  QUIZ = 'quiz',
  CERTIFICATE = 'certificate',
}