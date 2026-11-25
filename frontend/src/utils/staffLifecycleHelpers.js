/**
 * Staff Lifecycle & Onboarding Helper Utilities
 * Provisional - needs HR sign-off
 */

export function getStageBadge(stage) {
  if (stage === 'trainee') {
    return {
      label: 'Trainee',
      className: 'badge-blue',
      bg: '#DBEAFE',
      color: '#1E40AF',
      border: '#BFDBFE',
    };
  }
  if (stage === 'probation') {
    return {
      label: 'Probation',
      className: 'badge-amber',
      bg: '#FEF3C7',
      color: '#92400E',
      border: '#FDE68A',
    };
  }
  if (stage === 'active') {
    return {
      label: 'Active',
      className: 'badge-green',
      bg: '#DCFCE7',
      color: '#166534',
      border: '#BBF7D0',
    };
  }
  return {
    label: 'Not reviewed',
    className: 'badge-grey',
    bg: '#F1F5F9',
    color: '#475569',
    border: '#E2E8F0',
  };
}

export function isReviewDue(stage, probationEndDate, referenceDate = new Date()) {
  if (stage !== 'probation' || !probationEndDate) return false;
  const end = new Date(probationEndDate);
  const ref = new Date(referenceDate);
  // Reset hours to compare date portion
  end.setHours(0, 0, 0, 0);
  ref.setHours(0, 0, 0, 0);
  const diffDays = Math.round((end - ref) / (1000 * 60 * 60 * 24));
  return diffDays <= 14;
}

export function calculateProgress(requirements, gate = 'trainee_to_probation') {
  if (!requirements || !Array.isArray(requirements)) {
    return { completed: 0, total: 0, label: 'Docs 0/0', percentage: 0 };
  }

  const gateReqs = requirements.filter(r => {
    const g = r.requirement_type?.gate || r.gate;
    const active = r.requirement_type?.is_active ?? r.is_active ?? true;
    return g === gate && active;
  });

  const total = gateReqs.length;
  if (total === 0) {
    return { completed: 0, total: 0, label: 'Docs 0/0', percentage: 0 };
  }

  const completed = gateReqs.filter(r => {
    const status = r.status;
    if (status === 'waived') return true;
    if (status === 'verified') {
      const kind = r.requirement_type?.kind || r.kind;
      const reqCount = r.requirement_type?.required_count || r.required_count || 1;
      if (kind === 'document' && reqCount > 1) {
        const curDocs = (r.documents || []).filter(d => d.is_current !== false).length;
        return curDocs >= reqCount;
      }
      return true;
    }
    return false;
  }).length;

  const percentage = Math.round((completed / total) * 100);
  const label = gate === 'trainee_to_probation'
    ? `Docs ${completed}/${total}`
    : `Requirements ${completed}/${total}`;

  return { completed, total, label, percentage };
}

export function checkCanAdvance(stage, requirements) {
  if (stage !== 'trainee' && stage !== 'probation') {
    return { canAdvance: false, missing: [] };
  }

  const gate = stage === 'trainee' ? 'trainee_to_probation' : 'probation_to_active';
  const gateReqs = (requirements || []).filter(r => {
    const g = r.requirement_type?.gate || r.gate;
    const active = r.requirement_type?.is_active ?? r.is_active ?? true;
    return g === gate && active;
  });

  if (gateReqs.length === 0) {
    return { canAdvance: false, missing: ['No active requirements found'] };
  }

  const missing = [];
  for (const r of gateReqs) {
    const label = r.requirement_type?.label || r.label || r.code || 'Requirement';
    const status = r.status;
    if (status !== 'verified' && status !== 'waived') {
      missing.push(label);
    } else if (status === 'verified') {
      const kind = r.requirement_type?.kind || r.kind;
      const reqCount = r.requirement_type?.required_count || r.required_count || 1;
      if (kind === 'document' && reqCount > 1) {
        const curDocs = (r.documents || []).filter(d => d.is_current !== false).length;
        if (curDocs < reqCount) {
          missing.push(`${label} (${curDocs}/${reqCount} uploaded)`);
        }
      }
    }
  }

  return {
    canAdvance: missing.length === 0,
    missing,
  };
}
