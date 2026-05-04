'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** Optional right-side actions to render in the header */
  headerActions?: React.ReactNode;
}

/**
 * Shared dashboard shell providing the sticky header with navigation links
 * and toast infrastructure. Each route page supplies its own content as children.
 */
export default function DashboardLayout({ children, headerActions }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 2);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { href: '/', label: 'Home', icon: '⌂' },
    { href: '/templates', label: 'Templates', icon: '◫' },
    { href: '/tags', label: 'Tags', icon: '⬡' },
  ];

  return (
    <div className="pg-root">
      {/* ── Header ── */}
      <header className={`pg-header${scrolled ? ' pg-header--scrolled' : ''}`}>
        <div className="pg-header-inner">
          <div className="pg-brand">
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '14px', textDecoration: 'none' }}>
              {/* Print-lines icon */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect width="28" height="28" rx="5" fill="var(--pg-accent)" opacity="0.13" />
                <rect x="6"  y="7"  width="16" height="2" rx="1" fill="var(--pg-accent)" />
                <rect x="6"  y="12" width="11" height="2" rx="1" fill="var(--pg-accent)" opacity="0.65" />
                <rect x="6"  y="17" width="13" height="2" rx="1" fill="var(--pg-accent)" opacity="0.45" />
                <rect x="6"  y="22" width="8"  height="2" rx="1" fill="var(--pg-accent)" opacity="0.28" />
              </svg>
              <div>
                <h1 className="pg-title">PrintGenerator</h1>
                <p className="pg-subtitle">Template Management</p>
              </div>
            </Link>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Navigation links */}
            <nav className="pg-nav" aria-label="Main navigation">
              {navLinks.map((link) => {
                const isActive =
                  link.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`pg-nav-link${isActive ? ' pg-nav-link--active' : ''}`}
                  >
                    <span className="pg-nav-icon">{link.icon}</span>
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Separator */}
            {headerActions && <div className="pg-header-sep" />}
            
            {/* Page-specific actions */}
            {headerActions}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="pg-main">
        {children}
      </main>
    </div>
  );
}
