import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "molko-theme";

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to the default below.
  }
  // Light is the default theme regardless of system preference; dark only
  // applies once the user explicitly picks it via the toggle.
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark-mode", theme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore write failures — theme still applies for this session.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return { theme, toggleTheme };
}
