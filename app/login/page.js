"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "../../components/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not sign in.");
        setBusy(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(String(cause.message || cause));
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <ThemeToggle className="login-theme" />
      <form className="login-card" onSubmit={submit}>
        <div className="login-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              className="mark-line"
              d="M4 4h4l12 16h-4L4 4Zm16 0-6.2 7.4M4 20l6.3-7.5"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h1>x-sift</h1>
        <p>This tool is private. Enter the password to continue.</p>

        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          autoComplete="current-password"
          placeholder="••••••••••"
        />

        {error ? <div className="alert">{error}</div> : null}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
