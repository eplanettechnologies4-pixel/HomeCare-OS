import React from 'react';
import { Check } from 'lucide-react';

export function Stepper({ steps, currentStep, className = '' }) {
  // steps is array of { id, label }
  const currentIndex = steps.findIndex((s) => (typeof s === 'string' ? s : s.id) === currentStep);

  return (
    <div className={`stepper ${className}`.trim()}>
      {steps.map((step, idx) => {
        const id = typeof step === 'string' ? step : step.id;
        const label = typeof step === 'string' ? step : step.label;
        const isDone = idx < currentIndex;
        const isActive = idx === currentIndex;

        return (
          <div
            key={id}
            className={`stepper-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
          >
            <div className="stepper-dot">
              {isDone ? <Check size={12} strokeWidth={3} /> : idx + 1}
            </div>
            <span className="stepper-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default Stepper;
