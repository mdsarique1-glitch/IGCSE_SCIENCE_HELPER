import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const getApiKey = (): string => process.env.GEMINI_API_KEY || process.env.API_KEY || '';

const getAiClient = (): GoogleGenAI => {
  return new GoogleGenAI({
    apiKey: getApiKey(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

const primaryModel = 'gemini-3.1-flash-lite';
const fallbackModel = 'gemini-4-hydrogen';

// In-memory cache per warm serverless instance to reduce API calls
const explanationCache = new Map<string, any>();

// Schemas
const singleQuestionSchema = {
  type: Type.OBJECT,
  properties: {
    questionId: { type: Type.STRING, description: "Unique question identifier, e.g. Q-01" },
    syllabusRef: { type: Type.STRING, description: "Official syllabus line reference, e.g. '0625.1.2 Motion [Core]' or '0625.1.2 Motion [Supplement]'" },
    questionType: { type: Type.STRING, description: "Archetype: 'recall', 'calculation', 'conceptual', 'sequencing', 'experimental', or 'graph'" },
    question: { type: Type.STRING, description: "The authentic Cambridge IGCSE Paper 2 style multiple-choice question stem" },
    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4 plausible options with Cambridge P2 distractors based on common student misconceptions" },
    correctAnswer: {
      type: Type.STRING,
      description: "The exact matching text of the correct answer from options."
    },
    markingScheme: {
      type: Type.OBJECT,
      properties: {
        marks: { type: Type.INTEGER, description: "Number of marks for this question, usually 1 to 2" },
        breakdown: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Point-wise marking criteria matching Cambridge IGCSE Paper 2 standards"
        }
      },
      required: ['marks', 'breakdown']
    },
    examTip: {
      type: Type.STRING,
      description: "1 concise sentence warning about common exam traps or misconceptions for this specific topic."
    }
  },
  required: ['question', 'options', 'correctAnswer', 'syllabusRef', 'markingScheme', 'examTip']
};

const certificateDataSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "A short, encouraging, and positive performance summary celebrating the student's achievement." }
  },
  required: ['summary']
};

const soloImprovementReportSchema = {
  type: Type.OBJECT,
  properties: {
    improvementAreas: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "A list of 2-3 specific topics or concepts the student should focus on for improvement."
    },
    motivationalMessage: {
      type: Type.STRING,
      description: "A short, encouraging message motivating the student to study more and retake the quiz to earn a certificate."
    }
  },
  required: ['improvementAreas', 'motivationalMessage']
};

const explanationSchema = {
  type: Type.OBJECT,
  properties: {
    explanation: {
      type: Type.STRING,
      description: "A clear, concise explanation for a student. It should first explain why the correct answer is right, and then briefly explain why the user's selected answer is a common misconception, if applicable. Use basic HTML for formatting like <strong> and <em>."
    }
  },
  required: ['explanation']
};

const LATEX_ESCAPE_REPAIR_REGEX = /(?<!\\)\\(text|textbf|textit|textrm|times|theta|tau|tfrac|tan|triangle|frac|dfrac|forall|rightleftharpoons|rightarrow|right|rho|rangle|beta|bar|binom|neq|nabla|natural|Delta|Omega|Lambda|Sigma|Theta|alpha|gamma|delta|lambda|mu|sigma|pi|omega|sqrt|div|pm|approx|leq|geq|leftarrow|degree|cdot|,|;)/g;

const restoreCorruptedLatex = (value: unknown): any => {
  if (typeof value === 'string') {
    return value
      // Restore control chars produced when JSON.parse interprets \t, \f, \r, \b, \n before LaTeX commands
      .replace(/\t(ext|imes|heta|au|frac|an|riangle)/g, '\\t$1')
      .replace(/\f(rac|orall)/g, '\\f$1')
      .replace(/\r(ightleftharpoons|ightarrow|ight|ho|angle)/g, '\\r$1')
      .replace(/\x08(eta|ar|inom)/g, '\\b$1')
      .replace(/\n(eq|abla|atural)/g, '\\n$1')
      // Add thin space between a number and \text{unit} when missing
      .replace(/(\d)\s*\\text\{/g, '$1\\,\\text{');
  }
  if (Array.isArray(value)) {
    return value.map(restoreCorruptedLatex);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = restoreCorruptedLatex(v);
    }
    return out;
  }
  return value;
};

const parseGeminiJson = <T>(text: string): T => {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const rawJson = (match ? match[1] : text).trim();
  const repairedJson = rawJson.replace(LATEX_ESCAPE_REPAIR_REGEX, '\\\\$1');

  try {
    return restoreCorruptedLatex(JSON.parse(repairedJson)) as T;
  } catch {
    try {
      // Fallback: escape any remaining lone backslashes that are not valid JSON escapes
      const fallbackJson = repairedJson.replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, '\\\\');
      return restoreCorruptedLatex(JSON.parse(fallbackJson)) as T;
    } catch {
      console.error("Failed to parse JSON from Gemini response:", rawJson);
      throw new Error("Invalid JSON format received from API.");
    }
  }
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 2, delay = 800): Promise<T> => {
  let lastError: Error | null = new Error('Retry logic failed without catching an error.');
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries) {
        console.warn(`API call attempt ${i + 1} of ${retries + 1} failed. Retrying in ${delay * (i + 1)}ms...`, lastError.message);
        await new Promise(res => setTimeout(res, delay * (i + 1)));
      }
    }
  }
  throw lastError;
};

const apiCallWithFallback = async <T>(
  apiFn: (model: string) => Promise<T>,
  models: string[] = [primaryModel, fallbackModel]
): Promise<T> => {
  let lastError: any;
  for (const model of models) {
    try {
      return await apiFn(model);
    } catch (error: any) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Model '${model}' failed: ${errorMessage.slice(0, 100)}. Falling back to next model if available...`);
    }
  }
  throw lastError;
};

// Seeded PRNG
const mulberry32 = (seed: number) => {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

const shuffleArray = <T>(array: T[], prng: () => number = Math.random): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

async function generateQuestionBatch(
  syllabusPoints: string[],
  subject: 'physics' | 'biology' | 'chemistry',
  seed: number
): Promise<any[]> {
  const ai = getAiClient();
  const subjectTitle = subject.charAt(0).toUpperCase() + subject.slice(1);
  const syllabusCode = subject === 'physics' ? '0625' : subject === 'biology' ? '0610' : '0620';

  const prompt = `You are the primary engine for "IGCSE Science Helper", an expert IGCSE ${subjectTitle} (${syllabusCode}) tutor grounded directly in the official Cambridge IGCSE Paper 2 (P2) Multiple Choice Question Bank.
Generate ${syllabusPoints.length} ultra-fast, 100% syllabus-aligned multiple-choice questions, exactly one based strictly on each of the following syllabus points:
${syllabusPoints.map((pt, i) => `[Syllabus Point ${i + 1}]: "${pt}"`).join('\n')}

**Cambridge IGCSE Paper 2 (P2) Question Bank Principles & Archetypes:**
1. **Precision:** Strictly adhere to Cambridge IGCSE ${subjectTitle} (${syllabusCode}) standards. Stems must be crisp, scientific, and exam-grade.
2. **Archetype Rotation:**
   - 'conceptual': Conceptual reasoning & deductive logic (e.g. molecular motion, force balances, energy transfers, field lines).
   - 'calculation': Quantitative multi-step application with standard SI units and formula manipulation ($v=s/t$, $F=ma$, $W=mg$, $p=F/A$, $V=IR$, $E=mc\\Delta T$, $n=\\sin i/\\sin r$, half-life counts).
   - 'experimental': Instrument reading & laboratory deductions (measuring cylinder meniscus at eye level, micrometer/caliper, voltmeter/ammeter, ray box, test-tube reactions, bimetallic strips).
   - 'graph': Graph and waveform deductions (speed-time gradient=acceleration, area=distance; $I-V$ characteristic curves; decay graphs).
   - 'recall': Key definitions and fundamental laws.
   - 'sequencing': Procedural ordering of experimental steps or biological/chemical processes.
3. **Authentic Cambridge Distractors:** Distractors must reflect real student misconceptions from Cambridge Paper 2 examiner reports (e.g., confusing scalar with vector, inverted index of refraction, forgetting background count subtraction, forgetting $\\frac{1}{2}$ in kinetic energy).
4. **Systematic Mathematical & Chemical Formatting (KaTeX LaTeX):**
   - Format equations, algebraic formulas, fractions, exponents, roots, scientific notation, compound units with powers, and chemical formulas in **question** and **options** using clean inline LaTeX wrapped in single dollar signs \`$...$\` (e.g., \`$v = \\frac{s}{t}$\`, \`$E_k = \\frac{1}{2}mv^2$\`, \`$3.0 \\times 10^8\\,\\text{m/s}$\`, \`$9.8\\,\\text{m/s}^2$\`, \`$\\text{H}_2\\text{SO}_4$\`, \`$\\Delta T$\`, \`$\\Omega$\`).
   - Write simple quantities with plain units naturally as plain text with a space (e.g., \`4.0 m/s\`, \`1500 m\`, \`2 minutes\`) instead of wrapping plain words in \`\\text{...}\`.
   - Always double-escape backslashes inside JSON strings (e.g., \`\\\\frac\`, \`\\\\times\`, \`\\\\text\`) so JSON parsing preserves them intact.
   - Keep \`correctAnswer\` an exact verbatim string match to one of the strings in \`options\`.
5. **Marking Scheme:** Include a point-wise breakdown of marks matching official Cambridge IGCSE Paper 2 criteria.
6. **Exam Trap Tip:** Exactly 1 concise sentence addressing common pitfalls in Cambridge exams for this point.`;

  const makeApiCall = async (model: string) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: `You are the primary engine for IGCSE Science Helper, generating strictly Cambridge Paper 2 (P2) multiple-choice questions with marking schemes and examiner tips.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: singleQuestionSchema,
        },
        seed,
      },
    });
    return parseGeminiJson<any[]>(response.text || '');
  };

  const parsed = await apiCallWithFallback(makeApiCall);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Invalid format for question batch received from API.");
  }
  return parsed;
}

async function generateSingleQuestion(
  syllabusPoint: string,
  subject: 'physics' | 'biology' | 'chemistry',
  seed: number
) {
  const ai = getAiClient();
  const subjectTitle = subject.charAt(0).toUpperCase() + subject.slice(1);
  const syllabusCode = subject === 'physics' ? '0625' : subject === 'biology' ? '0610' : '0620';

  const prompt = `You are the primary engine for "IGCSE Science Helper", an expert IGCSE ${subjectTitle} (${syllabusCode}) tutor grounded in Cambridge IGCSE Paper 2 (P2). Generate one ultra-fast, 100% syllabus-aligned multiple-choice question based strictly on this syllabus point:
"${syllabusPoint}"

**Cambridge IGCSE Paper 2 Specifications:**
1. **Precision:** Strictly adhere to the Cambridge IGCSE ${subjectTitle} (${syllabusCode}) syllabus.
2. **Archetype:** Select an appropriate archetype ('recall', 'calculation', 'conceptual', 'sequencing', 'experimental', or 'graph').
3. **Systematic Mathematical & Chemical Formatting (KaTeX LaTeX):**
   - Format equations, algebraic formulas, fractions, exponents, roots, scientific notation, compound units with powers, and chemical formulas in **question** and **options** using clean inline LaTeX wrapped in single dollar signs \`$...$\` (e.g., \`$v = \\frac{s}{t}$\`, \`$3.0 \\times 10^8\\,\\text{m/s}$\`, \`$9.8\\,\\text{m/s}^2$\`, \`$\\text{CO}_2$\`).
   - Write simple quantities with plain units naturally as plain text with a space (e.g., \`4.0 m/s\`, \`1500 m\`, \`2 minutes\`).
   - Always double-escape backslashes inside JSON strings (\`\\\\frac\`, \`\\\\times\`, \`\\\\text\`).
4. **Components:**
   - **questionId**: "Q-${seed}"
   - **syllabusRef**: Precise syllabus section and topic, e.g. "${syllabusCode} topic reference"
   - **questionType**: 'recall' | 'calculation' | 'conceptual' | 'sequencing' | 'experimental' | 'graph'
   - **question**: Clear Cambridge P2 style stem with clean inline LaTeX math.
   - **options**: Exactly 4 distinct, plausible options targeting authentic student misconceptions, formatted with clean inline LaTeX math where applicable.
   - **correctAnswer**: Exact verbatim copy of one of the options.
   - **markingScheme**: { marks: 1 or 2, breakdown: ["Official Cambridge mark points"] }
   - **examTip**: 1 concise sentence on avoiding common student traps in exams.`;

  const makeApiCall = async (model: string) => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: `You are the primary engine for IGCSE Science Helper, generating strictly Cambridge Paper 2 (P2) multiple-choice questions with marking schemes and examiner tips.`,
        responseMimeType: "application/json",
        responseSchema: singleQuestionSchema,
        seed,
      },
    });
    return parseGeminiJson<any>(response.text || '');
  };

  const parsed = await apiCallWithFallback(makeApiCall);
  if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length === 0 || !parsed.correctAnswer) {
    throw new Error("Invalid format for a single quiz question received from API.");
  }
  return parsed;
}

const app = express();

app.use(express.json({ limit: '10mb' }));

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasKey: Boolean(getApiKey()) });
});

// Generate Quiz Questions Endpoint
app.post('/api/generate-quiz-questions', async (req, res) => {
  try {
    if (!getApiKey()) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }
    const { categories, questionCount, syllabusLevel, subject, seed, offset, limit } = req.body;
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'Categories are required' });
    }

    const quizSeed = typeof seed === 'number' ? seed : Math.floor(Math.random() * 1000000);
    const prng = mulberry32(quizSeed);

    const getAllSyllabusPoints = (cats: any[]): string[] => {
      const points: string[] = [];
      cats.forEach(category => {
        const processTopic = (topic: any, path: string) => {
          if (syllabusLevel === 'core' && topic.isSupplement) return;
          const currentPath = `${path} > ${topic.name}`;
          if (topic.indicators) {
            topic.indicators.forEach((indicator: any) => {
              if (syllabusLevel === 'core' && indicator.isSupplement) return;
              points.push(`${currentPath}: ${indicator.name}`);
            });
          }
          if (topic.subTopics) {
            topic.subTopics.forEach((subTopic: any) => {
              if (syllabusLevel === 'core' && subTopic.isSupplement) return;
              const subTopicPath = `${currentPath} > ${subTopic.name}`;
              if (subTopic.indicators) {
                subTopic.indicators.forEach((indicator: any) => {
                  if (syllabusLevel === 'core' && indicator.isSupplement) return;
                  points.push(`${subTopicPath}: ${indicator.name}`);
                });
              }
            });
          }
        };
        if (category.topics) {
          category.topics.forEach((topic: any) => processTopic(topic, category.name));
        }
      });
      return points;
    };

    const allPoints = getAllSyllabusPoints(categories);
    const count = Number(questionCount) || 10;
    if (allPoints.length < count) {
      return res.status(400).json({
        error: `Not enough syllabus content for a ${count}-question quiz in the selected topics. Please select more topics or a smaller quiz size.`
      });
    }

    const shuffledPoints = shuffleArray(allPoints, prng);
    const pointsForQuiz = shuffledPoints.slice(0, count);

    const startOffset = typeof offset === 'number' && offset >= 0 ? offset : 0;
    const chunkLimit = typeof limit === 'number' && limit > 0 ? limit : pointsForQuiz.length;
    const targetPoints = pointsForQuiz.slice(startOffset, startOffset + chunkLimit);

    if (targetPoints.length === 0) {
      return res.json([]);
    }

    // Keep batches small (<= 3) and run concurrently so each serverless invocation finishes well within Vercel timeouts
    const BATCH_SIZE = 3;
    const batchTasks: Array<{ batchPoints: string[]; batchSeed: number }> = [];
    for (let i = 0; i < targetPoints.length; i += BATCH_SIZE) {
      batchTasks.push({
        batchPoints: targetPoints.slice(i, i + BATCH_SIZE),
        batchSeed: quizSeed + startOffset + i,
      });
    }

    const batchResults = await Promise.all(
      batchTasks.map(async ({ batchPoints, batchSeed }) => {
        try {
          const batchResult = await withRetry(
            () => generateQuestionBatch(batchPoints, subject || 'physics', batchSeed),
            1,
            300
          );
          if (Array.isArray(batchResult) && batchResult.length > 0) {
            return batchResult;
          }
        } catch (batchErr) {
          console.warn("Batch question generation failed, falling back to parallel single questions:", batchErr);
        }

        const singleResults = await Promise.allSettled(
          batchPoints.map((pt, j) =>
            generateSingleQuestion(pt, subject || 'physics', batchSeed + j)
          )
        );
        return singleResults
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && Boolean(r.value))
          .map(r => r.value);
      })
    );

    const generatedQuestions = batchResults.flat();

    const validatedQuestions = generatedQuestions.map((q: any, idx: number) => {
      if (!q || !q.question || !Array.isArray(q.options) || q.options.length === 0 || !q.correctAnswer) {
        return null;
      }

      const options = q.options.slice(0, 4);
      let correctAnswer = q.correctAnswer;
      const saneCorrectAnswer = String(correctAnswer).trim().toLowerCase();
      const matchingOption = options.find((opt: string) => opt.trim().toLowerCase() === saneCorrectAnswer);

      if (matchingOption) {
        correctAnswer = matchingOption;
      } else {
        if (options.length < 4) {
          options.push(correctAnswer);
        } else {
          options[options.length - 1] = correctAnswer;
        }
      }

      const prngForOptionShuffle = mulberry32(quizSeed + startOffset + idx + 1);
      const shuffledOptions = shuffleArray(options, prngForOptionShuffle);
      return {
        questionId: q.questionId || `Q-${quizSeed}-${startOffset + idx}`,
        syllabusRef: q.syllabusRef || undefined,
        questionType: q.questionType || 'conceptual',
        question: q.question,
        options: shuffledOptions,
        correctAnswer,
        markingScheme: q.markingScheme || undefined,
        examTip: q.examTip || undefined
      };
    }).filter((q): q is any => q !== null);

    if (validatedQuestions.length === 0 && targetPoints.length > 0) {
      return res.status(500).json({
        error: `The AI model failed to generate valid questions for the selected topics. Please try again with a broader range of topics.`
      });
    }

    res.json(validatedQuestions);
  } catch (err: any) {
    console.error("Error in /api/generate-quiz-questions:", err);
    res.status(500).json({ error: err.message || 'Failed to generate quiz questions' });
  }
});

// Certificate Data Endpoint
app.post('/api/certificate-data', async (req, res) => {
  try {
    const ai = getAiClient();
    const { studentName, correctAnswers, totalQuestions, topics, subject } = req.body;
    const subjectTitle = subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : 'Science';

    const prompt = `
Task: Generate a short, positive performance summary for an IGCSE ${subjectTitle} student's certificate.

**Student Profile:**
- Name: ${studentName}
- Score: ${correctAnswers} out of ${totalQuestions}
- Topics Covered: ${(topics || []).join(', ')}

**Instructions:**
- Celebrate the student's achievement on the quiz topics.

**Required Output (JSON):**
- **summary**: A single string celebrating the student's achievement on the quiz topics.
`;

    const apiCall = async () => {
      const makeApiCall = async (model: string) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: certificateDataSchema,
          },
        });
        const data = parseGeminiJson<{ summary: string }>(response.text || '');
        if (!data.summary) {
          throw new Error("Missing summary in certificate response.");
        }
        return data;
      };
      return apiCallWithFallback(makeApiCall);
    };

    const certData = await withRetry(apiCall);
    res.json(certData);
  } catch (err: any) {
    console.error("Error in /api/certificate-data, using fallback summary:", err);
    const score = req.body.correctAnswers || 0;
    const total = req.body.totalQuestions || 0;
    const subjectTitle = req.body.subject ? req.body.subject.charAt(0).toUpperCase() + req.body.subject.slice(1) : 'Science';
    res.json({
      summary: `Outstanding effort in IGCSE ${subjectTitle}! Scored ${score} out of ${total} (${total > 0 ? Math.round((score / total) * 100) : 0}%) demonstrating strong mastery of the assessed syllabus concepts.`
    });
  }
});

// Solo Improvement Report Endpoint
app.post('/api/improvement-report', async (req, res) => {
  try {
    const ai = getAiClient();
    const { studentName, correctAnswers, totalQuestions, topics, subject } = req.body;
    const total = Number(totalQuestions) || 1;
    const accuracy = ((Number(correctAnswers) / total) * 100).toFixed(0);
    const subjectTitle = subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : 'Science';

    const prompt = `
Task: Generate a constructive improvement report for an IGCSE ${subjectTitle} student who did not pass their quiz.

**Student Profile:**
- Name: ${studentName}
- Score: ${correctAnswers} out of ${totalQuestions} (${accuracy}%)
- Topics Covered: ${(topics || []).join(', ')}

**Required Output (JSON):**
1. **improvementAreas**: An array of 2-3 specific, actionable topics from the list above that the student should review. For example, for Physics: "Distinguishing between scalar and vector quantities". For Biology: "The role of osmosis in plant cells".
2. **motivationalMessage**: A brief, encouraging message to motivate the student to try again.

Generate a JSON object that strictly follows this structure.`;

    const apiCall = async () => {
      const makeApiCall = async (model: string) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: soloImprovementReportSchema,
          },
        });
        const report = parseGeminiJson<{ improvementAreas: string[]; motivationalMessage: string }>(response.text || '');
        if (!report.improvementAreas || !report.motivationalMessage) {
          throw new Error("Invalid report format received from API.");
        }
        return report;
      };
      return apiCallWithFallback(makeApiCall);
    };

    const report = await withRetry(apiCall);
    res.json(report);
  } catch (err: any) {
    console.error("Error in /api/improvement-report, using fallback report:", err);
    const subjectTitle = req.body.subject ? req.body.subject.charAt(0).toUpperCase() + req.body.subject.slice(1) : 'Science';
    res.json({
      improvementAreas: [
        `Review core definitions and SI units for the selected ${subjectTitle} topics`,
        "Practice identifying common Cambridge Paper 2 trap options and distractors",
        "Work through formula rearrangements and numerical unit conversions"
      ],
      motivationalMessage: "Every practice quiz strengthens your exam technique! Review the syllabus indicators for these topics and give it another shot."
    });
  }
});

// Question Explanation Endpoint
app.post('/api/explain-question', async (req, res) => {
  try {
    const ai = getAiClient();
    const { question, incorrectAnswer } = req.body;
    if (!question || !incorrectAnswer) {
      return res.status(400).json({ error: 'Question and incorrect answer are required' });
    }

    const cacheKey = `${question.question}-${incorrectAnswer}`;
    if (explanationCache.has(cacheKey)) {
      return res.json(explanationCache.get(cacheKey));
    }

    const prompt = `
Task: Explain a multiple-choice question to an IGCSE student who answered it incorrectly.

**Question Details:**
- Question: "${question.question}"
- Options: ${JSON.stringify(question.options)}
- Correct Answer: "${question.correctAnswer}"
- Student's Incorrect Answer: "${incorrectAnswer}"

**Instructions:**
1. Start by clearly explaining why "${question.correctAnswer}" is the correct answer.
2. Then, explain why the student's choice, "${incorrectAnswer}", is incorrect. Address the common misconception if possible.
3. Keep the tone encouraging and educational.
4. Use simple HTML tags like <strong> for emphasis and <em> for italics where appropriate.
5. The entire explanation should be concise, ideally 2-4 sentences.

**Required Output (JSON):**
- **explanation**: A single string containing the full explanation.
`;

    const apiCall = async () => {
      const makeApiCall = async (model: string) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: explanationSchema,
          },
        });
        const data = parseGeminiJson<{ explanation: string }>(response.text || '');
        if (!data.explanation) {
          throw new Error("Invalid explanation data format from API.");
        }
        return data;
      };
      return apiCallWithFallback(makeApiCall);
    };

    const explanation = await withRetry(apiCall, 1);
    explanationCache.set(cacheKey, explanation);
    res.json(explanation);
  } catch (err: any) {
    console.error("Error in /api/explain-question, using fallback explanation:", err);
    const correctAnswer = req.body.question?.correctAnswer || 'the key option indicated';
    const studentChoice = req.body.incorrectAnswer || 'your selected choice';
    res.json({
      explanation: `<strong>Correct Answer:</strong> <em>${correctAnswer}</em> is the scientifically correct answer according to Cambridge syllabus criteria. <em>${studentChoice}</em> represents a common distractor misconception in Paper 2 multiple-choice questions. Be sure to verify all variables and definitions.`
    });
  }
});

// Streaming Content Endpoint (SSE)
app.post('/api/gemini/stream', async (req, res) => {
  try {
    if (!getApiKey()) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }
    const ai = getAiClient();
    const { prompt, systemInstruction } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const responseStream = await ai.models.generateContentStream({
      model: primaryModel,
      contents: prompt,
      config: systemInstruction ? { systemInstruction } : undefined,
    });

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('Streaming error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'Stream error' });
    }
    res.write(`data: ${JSON.stringify({ error: error.message || 'Stream error' })}\n\n`);
    res.end();
  }
});

// Return JSON 404 for unknown /api/* routes instead of falling through
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

export default app;
