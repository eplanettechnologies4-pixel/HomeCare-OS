import React from 'react';

export function Tabs({ tabs, activeTab, onChange, className = '' }) {
  return (
    <div className={`tab-bar ${className}`.trim()} role="tablist">
      {tabs.map((tab) => {
        const id = typeof tab === 'string' ? tab : tab.id;
        const label = typeof tab === 'string' ? tab : tab.label;
        const count = tab.count !== undefined ? tab.count : null;
        const Icon = tab.icon || null;
        const isActive = activeTab === id;

        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            className={`tab-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChange(id)}
          >
            {Icon && <Icon size={15} />}
            <span>{label}</span>
            {count !== null && (
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: isActive ? 'var(--primary-soft)' : 'var(--gray-100)',
                  color: isActive ? 'var(--primary-dark)' : 'var(--muted)',
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
