import { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import {
  Navbar as NavbarComponent,
  NavBody,
  NavItems,
  MobileNav,
  NavbarLogo,
  NavbarButton,
  MobileNavHeader,
  MobileNavToggle,
  MobileNavMenu,
} from "./ui/resizable-navbar";

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Initialize from localStorage or system preference
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return savedTheme === 'dark' || (!savedTheme && prefersDark);
    }
    return false;
  });

  // Apply theme class to HTML element whenever isDarkMode changes
  useEffect(() => {
    const htmlElement = document.documentElement;
    const currentClasses = htmlElement.className || '';
    const hasHydrated = currentClasses.includes('hydrated');
    const hasDark = currentClasses.includes('dark');
    
    let newClasses = currentClasses
      .split(' ')
      .filter(c => c && c !== 'dark')
      .join(' ')
      .trim();
    
    if (isDarkMode) {
      newClasses = newClasses ? `${newClasses} dark` : 'dark';
      htmlElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      htmlElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    }
    
    // If hydrated class exists, preserve it
    if (hasHydrated && !newClasses.includes('hydrated')) {
      newClasses = newClasses ? `hydrated ${newClasses}` : 'hydrated';
    }
    
    htmlElement.className = newClasses;
  }, [isDarkMode]);

  // Toggle theme
  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  const navItems = [
    {
      name: "Home",
      link: "/",
    },
    {
      name: "Transfer",
      link: "/transfer",
    },
    {
      name: "AI Assistant",
      link: "/ai",
    },
  ];

  return (
    <NavbarComponent>
      {/* Desktop Navigation */}
      <NavBody>
        <Link to="/" className="flex items-center gap-2">
          <NavbarLogo>
            <img 
              src="/crossdrop-icon.svg" 
              alt="CrossDrop" 
              className="w-8 h-8"
            />
            <span>CrossDrop</span>
          </NavbarLogo>
        </Link>
        <NavItems items={navItems} />
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? (
              // Sun icon for light mode
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              // Moon icon for dark mode
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </NavBody>

      {/* Mobile Navigation */}
      <MobileNav>
        <MobileNavHeader>
          <Link to="/" className="flex items-center gap-2">
            <NavbarLogo>
              <img 
                src="/crossdrop-icon.svg" 
                alt="CrossDrop" 
                className="w-7 h-7"
              />
              <span>CrossDrop</span>
            </NavbarLogo>
          </Link>
          <MobileNavToggle
            isOpen={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          />
        </MobileNavHeader>
        <MobileNavMenu 
          isOpen={isMobileMenuOpen} 
          onClose={() => setIsMobileMenuOpen(false)}
        >
          {navItems.map((item, idx) => (
            <Link
              key={`mobile-link-${idx}`}
              to={item.link}
              onClick={() => setIsMobileMenuOpen(false)}
              className="relative text-neutral-600 dark:text-neutral-300 block py-2"
            >
              <span className="block">{item.name}</span>
            </Link>
          ))}
          <div className="flex w-full items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-800 mt-4">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Theme</span>
            <button
              onClick={() => {
                toggleTheme();
              }}
              className="p-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? (
                // Sun icon for light mode
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                // Moon icon for dark mode
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </MobileNavMenu>
      </MobileNav>
    </NavbarComponent>
  );
};

export default Navbar;
