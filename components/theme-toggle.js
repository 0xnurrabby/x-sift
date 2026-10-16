"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "x-sift-theme";

function Sun() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.9" />
      <path
        d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Moon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage can be blocked; the toggle still works for this page view */
    }
  }

  if (!theme) {
    return (
      <span className={`btn ${className}`} aria-hidden="true" style={{ visibility: "hidden" }}>
        Light
      </span>
    );
  }

  const toLight = theme === "dark";
  const label = toLight ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button type="button" className={`btn ${className}`} onClick={toggle} aria-label={label} title={label}>
      {toLight ? <Sun /> : <Moon />}
      {toLight ? "Light" : "Dark"}
    </button>
  );
}
