import React from 'react';
import { useAIUsage } from '../context/AIUsageContext.jsx';

// Small inline "⚡N" credit-cost label for an AI action. Drop next to any AI
// button/trigger: <CreditCost feature="design-ai-image" />. Reads the cost from
// the same map the backend charges against.
export default function CreditCost({ feature, style, title }) {
  const { costOf } = useAIUsage();
  const c = costOf(feature);
  return (
    <span
      title={title || `Costs ${c} AI credit${c === 1 ? '' : 's'}`}
      style={{
        fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--ink-3)',
        display: 'inline-flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', ...style,
      }}
    >
      <i className="ph ph-lightning" style={{ fontSize: 11 }} />{c}
    </span>
  );
}
