import React, { useMemo } from 'react';
import katex from 'katex';

interface MathTextProps {
  text: string;
  className?: string;
}

type Segment =
  | { type: 'text'; content: string }
  | { type: 'inline-math'; content: string }
  | { type: 'display-math'; content: string };

// Currency-safe inline & display math matcher:
// Closing '$' must not be followed by a digit (prevents "$0.20 ... $0.60" currency pairing).
const EXPLICIT_MATH_REGEX =
  /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\s)(?:\\.|[^$\n])+?(?<!\s)\$(?!\d))/g;

const IMPLICIT_MATH_REGEX =
  /((?:\d+(?:\.\d+)?\s*(?:×|x|\*)\s*10\^(?:\{-?\d+\}|-?\d+))|(?:\\(?:frac|dfrac|tfrac|sqrt)\{[^{}]*\}(?:\{[^{}]*\})?)|(?:\\(?:Delta|Omega|Lambda|Sigma|Theta|alpha|beta|gamma|delta|theta|lambda|mu|rho|sigma|pi|omega|times|div|pm|approx|neq|leq|geq|rightarrow|leftarrow|rightleftharpoons|degree|cdot)\b)|(?:[A-Za-z0-9)\]}]+\^(?:\{[^}]+\}|-?\d+))|(?:[A-Za-z]+_(?:\{[^}]+\}|\d+)))/g;

function sanitizeMathSource(raw: string): string {
  return raw
    // Repair control characters caused by JSON parsing \t, \f, \r, \b, \n before LaTeX commands
    .replace(/\t(ext|imes|heta|au|frac|an|riangle)/g, '\\t$1')
    .replace(/\f(rac|orall)/g, '\\f$1')
    .replace(/\r(ightleftharpoons|ightarrow|ight|ho|angle)/g, '\\r$1')
    .replace(/\x08(eta|ar|inom)/g, '\\b$1')
    .replace(/\n(eq|abla|atural)/g, '\\n$1')
    // Repair cases where \t was stripped leaving literal ext{...} or <num>ext<unit>
    .replace(/(^|[^a-zA-Z\\])ext\{/g, '$1\\text{')
    .replace(/(\d)\s*ext([A-Za-z/%°µΩ]+(?:\/[A-Za-z0-9^]+)?)/g, '$1\\,\\text{$2}')
    // Ensure clean thin spacing between numbers and \text{unit}
    .replace(/(\d)\s*\\text\{/g, '$1\\,\\text{');
}

function normalizeImplicitMath(token: string): string {
  let normalized = token.replace(/(\d+(?:\.\d+)?)\s*(?:×|x|\*)\s*10\^/g, '$1 \\times 10^');
  normalized = normalized.replace(/\^(-?\d{2,}|-\d)/g, '^{$1}');
  normalized = normalized.replace(/_(\d{2,})/g, '_{$1}');
  return normalized;
}

function tokenizePlainSegment(plain: string): Segment[] {
  const result: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  IMPLICIT_MATH_REGEX.lastIndex = 0;
  while ((match = IMPLICIT_MATH_REGEX.exec(plain)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: 'text', content: plain.slice(lastIndex, match.index) });
    }
    result.push({
      type: 'inline-math',
      content: normalizeImplicitMath(match[0]),
    });
    lastIndex = IMPLICIT_MATH_REGEX.lastIndex;
  }

  if (lastIndex < plain.length) {
    result.push({ type: 'text', content: plain.slice(lastIndex) });
  }

  return result;
}

function isLikelyCurrencyPair(inner: string): boolean {
  // e.g. "$0.20 per kWh to $" when not containing LaTeX commands or math operators
  return /^\d+(?:[.,]\d+)?\s+[a-zA-Z]{2,}/.test(inner) && !/[\\^_=+\-*/×÷]/.test(inner);
}

function parseMathSegments(rawInput: string): Segment[] {
  if (!rawInput) return [];
  const input = sanitizeMathSource(rawInput);

  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  EXPLICIT_MATH_REGEX.lastIndex = 0;
  while ((match = EXPLICIT_MATH_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      const preceding = input.slice(lastIndex, match.index);
      segments.push(...tokenizePlainSegment(preceding));
    }

    const raw = match[0];
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
      segments.push({ type: 'display-math', content: sanitizeMathSource(raw.slice(2, -2).trim()) });
    } else if (raw.startsWith('\\[') && raw.endsWith('\\]')) {
      segments.push({ type: 'display-math', content: sanitizeMathSource(raw.slice(2, -2).trim()) });
    } else if (raw.startsWith('\\(') && raw.endsWith('\\)')) {
      segments.push({ type: 'inline-math', content: sanitizeMathSource(raw.slice(2, -2).trim()) });
    } else if (raw.startsWith('$') && raw.endsWith('$')) {
      const inner = raw.slice(1, -1).trim();
      if (isLikelyCurrencyPair(inner)) {
        segments.push(...tokenizePlainSegment(raw));
      } else {
        segments.push({ type: 'inline-math', content: sanitizeMathSource(inner) });
      }
    } else {
      segments.push({ type: 'text', content: raw });
    }

    lastIndex = EXPLICIT_MATH_REGEX.lastIndex;
  }

  if (lastIndex < input.length) {
    segments.push(...tokenizePlainSegment(input.slice(lastIndex)));
  }

  return segments;
}

function renderKatexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return latex;
  }
}

export function renderMathInHtml(html: string): string {
  if (!html) return '';
  // Split around HTML tags so KaTeX only processes text nodes, never tag attributes
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith('<') && part.endsWith('>')) {
        return part;
      }
      return parseMathSegments(part)
        .map((seg) => {
          if (seg.type === 'text') return seg.content;
          if (seg.type === 'display-math') {
            return `<span class="math-display-inline block my-2 overflow-x-auto max-w-full text-center">${renderKatexHtml(seg.content, true)}</span>`;
          }
          return `<span class="math-inline inline-block align-baseline">${renderKatexHtml(seg.content, false)}</span>`;
        })
        .join('');
    })
    .join('');
}

const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  const segments = useMemo(() => parseMathSegments(text), [text]);

  return (
    <span className={`math-text-root ${className}`}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <React.Fragment key={index}>{segment.content}</React.Fragment>;
        }

        if (segment.type === 'display-math') {
          const html = renderKatexHtml(segment.content, true);
          return (
            <span
              key={index}
              className="math-display-inline block my-2 overflow-x-auto max-w-full text-center"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        const html = renderKatexHtml(segment.content, false);
        return (
          <span
            key={index}
            className="math-inline inline-block align-baseline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
};

export default MathText;
