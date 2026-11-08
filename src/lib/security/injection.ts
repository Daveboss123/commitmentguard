export interface InjectionFinding {
  pattern: string;
  excerpt: string;
}

export interface InjectionScan {
  detected: boolean;
  findings: InjectionFinding[];
}

const PATTERNS: Array<{ label: string; regex: RegExp }> = [
  {
    label: "instruction override",
    regex:
      /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|system|developer)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?)\b/i,
  },
  {
    label: "role hijack",
    regex: /\b(you are now|act as|new system prompt|system prompt:|developer mode)\b/i,
  },
  {
    label: "decision tampering",
    regex:
      /\b(mark|treat|label|return|classify)\b[^.\n]{0,30}\b(this|the)?\s*(offer|analysis|decision)\b[^.\n]{0,20}\b(allow|approved|safe|not a violation)\b/i,
  },
  {
    label: "constraint bypass",
    regex:
      /\b(bypass|override|skip|ignore|waive)\b[^.\n]{0,30}\b(constraint|policy|limit|check|block|rule)s?\b/i,
  },
  {
    label: "payment instruction",
    regex:
      /\b(send|transfer|pay|execute)\b[^.\n]{0,30}\b(payment|funds|usdc|wallet|checkout)\b/i,
  },
  {
    label: "prompt exfiltration",
    regex:
      /\b(reveal|print|show|leak)\b[^.\n]{0,30}\b(system prompt|api key|secret|instructions)\b/i,
  },
  {
    label: "authority spoofing",
    regex:
      /\b(administrator|admin|developer|openai|openserv|provider)\b[^.\n]{0,20}\b(authori[sz]es?|approves?|requires?|confirms?)\b/i,
  },
];

/**
 * Detects prompt-injection attempts in untrusted document text. Detection is
 * informational only: the text remains data and is never executed.
 */
export function scanForInjection(text: string, maxFindings = 5): InjectionScan {
  const findings: InjectionFinding[] = [];
  for (const { label, regex } of PATTERNS) {
    const match = regex.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 40);
      const end = Math.min(text.length, match.index + match[0].length + 60);
      findings.push({
        pattern: label,
        excerpt: text.slice(start, end).replace(/\s+/g, " ").trim(),
      });
      if (findings.length >= maxFindings) break;
    }
  }
  return { detected: findings.length > 0, findings };
}
