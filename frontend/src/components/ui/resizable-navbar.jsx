import { createContext } from "react";

const NavbarContext = createContext(undefined);

export function Navbar({ children, className = "" }) {
  return (
    <NavbarContext.Provider value={{}}>
      <nav className={`fixed top-0 z-50 w-full border-b border-neutral-200 bg-white/80 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/80 ${className}`}>
        {children}
      </nav>
    </NavbarContext.Provider>
  );
}

export function NavBody({ children, className = "" }) {
  return (
    <div className={`container mx-auto flex items-center justify-between px-4 py-3 md:px-6 ${className}`}>
      {children}
    </div>
  );
}

export function NavbarLogo({ children, className = "" }) {
  return (
    <div className={`flex items-center gap-2 font-bold text-xl text-neutral-900 dark:text-white ${className}`}>
      {children || "CrossDrop"}
    </div>
  );
}

export function NavItems({ items = [], className = "" }) {
  return (
    <div className={`hidden md:flex items-center gap-6 ${className}`}>
      {items.map((item, idx) => (
        <a
          key={`nav-link-${idx}`}
          href={item.link}
          className="relative text-sm font-medium text-neutral-700 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
        >
          {item.name}
        </a>
      ))}
    </div>
  );
}

export function NavbarButton({ 
  children, 
  variant = "primary", 
  className = "",
  onClick,
  ...props 
}) {
  const baseStyles = "px-4 py-2 rounded-lg text-sm font-medium transition-colors";
  const variants = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900",
    secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

export function MobileNav({ children, className = "" }) {
  return (
    <div className={`md:hidden ${className}`}>
      {children}
    </div>
  );
}

export function MobileNavHeader({ children, className = "" }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${className}`}>
      {children}
    </div>
  );
}

export function MobileNavToggle({ isOpen, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1.5 p-2 ${className}`}
      aria-label="Toggle menu"
    >
      <span
        className={`block h-0.5 w-6 bg-neutral-900 transition-all dark:bg-white ${
          isOpen ? "rotate-45 translate-y-2" : ""
        }`}
      />
      <span
        className={`block h-0.5 w-6 bg-neutral-900 transition-all dark:bg-white ${
          isOpen ? "opacity-0" : ""
        }`}
      />
      <span
        className={`block h-0.5 w-6 bg-neutral-900 transition-all dark:bg-white ${
          isOpen ? "-rotate-45 -translate-y-2" : ""
        }`}
      />
    </button>
  );
}

export function MobileNavMenu({ isOpen, onClose, children, className = "" }) {
  return (
    <div
      className={`overflow-hidden transition-all duration-300 ${
        isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
      } ${className}`}
    >
      <div className="px-4 pb-4 pt-2 space-y-2">
        {children}
      </div>
    </div>
  );
}

