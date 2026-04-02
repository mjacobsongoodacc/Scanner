export default function Sidebar({ items, active, onChange }) {
  return (
    <aside className="app-sidebar" role="navigation" aria-label="Main navigation">
      {items.map(({ key, icon: Icon, title, showBadge }) => (
        <button
          key={key}
          type="button"
          className={`app-sidebar-btn${active === key ? " is-active" : ""}`}
          title={title}
          aria-label={title}
          aria-current={active === key ? "page" : undefined}
          onClick={() => onChange(key)}
        >
          <span className="app-sidebar-btn-icon-wrap">
            <Icon size={20} strokeWidth={1.65} />
            {showBadge ? <span className="sidebar-badge-dot" aria-hidden /> : null}
          </span>
        </button>
      ))}
    </aside>
  );
}
