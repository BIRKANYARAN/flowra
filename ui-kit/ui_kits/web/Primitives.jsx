/* global React */
const { useState, forwardRef, useEffect } = React;

/* ── cn helper ─────────────────────────────────────────────────────────── */
window.cn = function cn(...args) {
  return args.filter(Boolean).join(' ');
}
const cn = window.cn;

/* ── Icon — Lucide via global ─────────────────────────────────────────── */
function Icon({ name, size = 16, className = '', strokeWidth = 1.5 }) {
  // names use Lucide's kebab-case so we can pass directly to lucide.icons
  const ref = React.useRef(null);
  useEffect(() => {
    if (!ref.current || !window.lucide) return;
    ref.current.innerHTML = '';
    const node = document.createElement('i');
    node.setAttribute('data-lucide', name);
    ref.current.appendChild(node);
    window.lucide.createIcons({
      attrs: { width: size, height: size, 'stroke-width': strokeWidth, class: className },
    });
  }, [name, size, strokeWidth, className]);
  return <span ref={ref} style={{ display: 'inline-flex', width: size, height: size }} />;
}

/* ── Label · tiny uppercase ───────────────────────────────────────────── */
function Label({ children, className }) {
  return <div className={cn('text-[10px] font-bold uppercase tracking-widest text-gray-400', className)}>{children}</div>;
}

/* ── Btn ──────────────────────────────────────────────────────────────── */
const BTN_VARIANT = {
  primary:   'bg-violet-600 hover:bg-violet-700 text-white shadow-sm',
  secondary: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
  ghost:     'text-gray-500 hover:text-gray-900 hover:bg-gray-50',
  danger:    'bg-red-50 hover:bg-red-100 text-red-700 border border-red-100',
  success:   'bg-emerald-600 hover:bg-emerald-700 text-white',
};
const BTN_SIZE = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
const Btn = forwardRef(function Btn(
  { variant = 'secondary', size = 'md', leftIcon, rightIcon, children, className = '', ...rest }, ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        BTN_VARIANT[variant], BTN_SIZE[size], className,
      )}
      {...rest}
    >
      {leftIcon}{children}{rightIcon}
    </button>
  );
});

/* ── Card ─────────────────────────────────────────────────────────────── */
function Card({ padding = 'md', interactive = false, className = '', children, onClick }) {
  const pad = { none: 'p-0', sm: 'p-4', md: 'p-5', lg: 'p-6' }[padding];
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white border border-gray-200 rounded-2xl', pad,
        (interactive || onClick) && 'hover:border-gray-300 cursor-pointer transition-colors',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Input ────────────────────────────────────────────────────────────── */
function Input({ label, prefix, suffix, error, className = '', ...rest }) {
  return (
    <div className={className}>
      {label && <div className="text-xs font-semibold text-gray-700 mb-1.5">{label}</div>}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">{prefix}</span>
        )}
        <input
          className={cn(
            'w-full bg-white border rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors',
            'focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
            prefix && 'pl-8',
            suffix && 'pr-10',
            error ? 'border-red-300' : 'border-gray-200',
          )}
          {...rest}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{suffix}</span>
        )}
      </div>
      {error && <div className="text-[11px] text-red-600 mt-1">{error}</div>}
    </div>
  );
}

/* ── Money ────────────────────────────────────────────────────────────── */
function fmtMoney(n, decimals = 2) {
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function Money({ value, currency = '₺', decimals = 2, emphasis = 'normal', tone = 'neutral', signed = false, className = '' }) {
  const emph = {
    normal: 'text-sm font-semibold',
    strong: 'text-sm font-bold',
    xl:     'text-lg font-black',
    kpi:    'text-2xl font-black tracking-tight',
    total:  'text-3xl font-black tracking-tight',
  }[emphasis];
  const toneCls = {
    neutral:  'text-gray-900',
    positive: 'text-emerald-700',
    negative: 'text-red-700',
  }[tone];
  const sign = signed && value > 0 ? '+' : signed && value < 0 ? '−' : '';
  const abs = Math.abs(value);
  return (
    <span className={cn('tabular-nums', emph, toneCls, className)}>
      {sign}<span className="mr-0.5 text-gray-400 font-normal">{currency}</span>{fmtMoney(abs, decimals)}
    </span>
  );
}

/* ── StatusBadge ──────────────────────────────────────────────────────── */
const STATUS = {
  draft:        { label: 'Taslak',       cls: 'bg-gray-100 text-gray-600' },
  sent:         { label: 'Gönderildi',   cls: 'bg-blue-50 text-blue-700' },
  accepted:     { label: 'Onaylandı',    cls: 'bg-emerald-50 text-emerald-700' },
  rejected:     { label: 'Reddedildi',   cls: 'bg-red-50 text-red-700' },
  converted:    { label: 'Dönüştürüldü', cls: 'bg-violet-50 text-violet-700' },
  paid:         { label: 'Ödendi',       cls: 'bg-emerald-50 text-emerald-700' },
  unpaid:       { label: 'Bekliyor',     cls: 'bg-amber-50 text-amber-700' },
  overdue:      { label: 'Gecikmiş',     cls: 'bg-red-50 text-red-700' },
  completed:    { label: 'Tamamlandı',   cls: 'bg-emerald-50 text-emerald-700' },
};
function StatusBadge({ status }) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold', s.cls)}>{s.label}</span>;
}

/* ── Alert ────────────────────────────────────────────────────────────── */
const ALERT_PALETTE = {
  warning: { bg: 'bg-amber-50 border-amber-200',     fg: 'text-amber-700',   icon: 'alert-triangle' },
  danger:  { bg: 'bg-red-50 border-red-200',         fg: 'text-red-700',     icon: 'flame' },
  info:    { bg: 'bg-blue-50 border-blue-200',       fg: 'text-blue-700',    icon: 'info' },
  success: { bg: 'bg-emerald-50 border-emerald-200', fg: 'text-emerald-700', icon: 'check' },
  orange:  { bg: 'bg-orange-50 border-orange-200',   fg: 'text-orange-700',  icon: 'alert-triangle' },
};
function Alert({ tone = 'warning', text, sub, onClick }) {
  const p = ALERT_PALETTE[tone];
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 border rounded-lg px-3 py-1.5 transition-all',
        p.bg,
        onClick && 'hover:shadow-sm cursor-pointer',
      )}
    >
      <span className={cn('shrink-0', p.fg)}><Icon name={p.icon} size={14} /></span>
      <span className={cn('text-xs font-semibold', p.fg)}>{text}</span>
      {sub && <span className="text-[11px] text-gray-400 ml-1 truncate">{sub}</span>}
      {onClick && <span className={cn('text-[10px] font-bold ml-auto shrink-0', p.fg)}>→</span>}
    </div>
  );
}

/* ── KpiCard ──────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, delta, tone = 'neutral', onClick, currency = '₺' }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex flex-col gap-1',
        onClick && 'hover:border-gray-300 transition-colors cursor-pointer',
      )}
    >
      <Label>{label}</Label>
      <div className="leading-none mt-0.5">
        <Money value={value} currency={currency} decimals={0} emphasis="kpi" tone={tone === 'neutral' ? 'neutral' : tone} />
      </div>
      {sub && <div className="text-[10px] text-gray-400 leading-tight truncate">{sub}</div>}
      {delta !== undefined && (
        <div className={cn(
          'text-[11px] font-semibold tabular-nums',
          delta >= 0 ? 'text-emerald-600' : 'text-red-600',
        )}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          <span className="text-gray-400 font-normal"> geçen ay</span>
        </div>
      )}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */
function EmptyState({ icon = '📄', title, sub, action }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl text-center py-16 px-6">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="font-semibold text-gray-700 mb-1">{title}</p>
      {sub && <p className="text-sm text-gray-400 mb-5">{sub}</p>}
      {action}
    </div>
  );
}

Object.assign(window, { Btn, Card, Input, Label, Money, StatusBadge, Alert, KpiCard, Icon, EmptyState, fmtMoney });
