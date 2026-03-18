import type { RiskSignal } from './signals.js';
import type { Position } from '../types.js';

export function analyzeRiskSignalPrompt(signal: RiskSignal): string {
  return `You are a DeFi risk analyst. Analyze this risk signal and provide a concise assessment.

Signal:
- Chain: ${signal.chain}
- Protocol: ${signal.protocol}
- Type: ${signal.type}
- Current severity: ${signal.severity}
- Event: ${signal.event}
- Details: ${signal.details}

Respond ONLY with valid JSON, no markdown fences:
{
  "summary": "2-3 sentence risk assessment explaining the situation and implications",
  "action": "Specific recommended action the operator should take",
  "adjustedSeverity": "low | medium | high | critical"
}`;
}

export function dailyDigestPrompt(
  positions: Position[],
  signals: RiskSignal[],
  date: string,
): string {
  const totalExposure = positions.reduce((sum, p) => sum + p.valueUsd, 0);
  const avgHealth =
    positions.length > 0
      ? positions.reduce((sum, p) => sum + p.healthFactor, 0) / positions.length
      : 0;

  return `You are a DeFi portfolio risk analyst. Generate a concise daily digest for ${date}.

Portfolio Summary:
- Total Exposure: $${totalExposure.toLocaleString()}
- Average Health Factor: ${avgHealth.toFixed(2)}
- Active Positions: ${positions.length}
- Risk Events Today: ${signals.length}

Positions:
${positions.map((p) => `- ${p.name}: $${p.valueUsd.toLocaleString()} | Health: ${p.healthFactor} | ${p.riskLevel}`).join('\n')}

Risk Events:
${signals.map((s) => `- [${s.severity.toUpperCase()}] ${s.event}: ${s.details}`).join('\n')}

Respond ONLY with valid JSON, no markdown fences:
{
  "summary": "2-3 sentence portfolio overview",
  "recommendations": ["action 1", "action 2", "action 3"],
  "fullAnalysis": "detailed multi-paragraph analysis covering risk exposure, protocol health, and market context"
}`;
}
