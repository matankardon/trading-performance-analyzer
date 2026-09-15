import { useState } from "react";
import { supabase } from "./supabaseClient";

function Auth({ onAuthSuccess }) {
  const [mode, setMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!email.trim() || !password) {
      setError(
        "Please enter your email and password."
      );
      return;
    }

    if (mode === "signup") {
      if (password.length < 6) {
        setError(
          "Password must be at least 6 characters."
        );
        return;
      }

      if (password !== confirmPassword) {
        setError(
          "Passwords do not match."
        );
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const {
          data,
          error: loginError,
        } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (loginError) {
          throw loginError;
        }

        if (data?.user) {
          setMessage("Login successful.");

          if (onAuthSuccess) {
            onAuthSuccess(data.user);
          }
        }
      } else {
        const {
          data,
          error: signupError,
        } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (signupError) {
          throw signupError;
        }

        if (data?.session) {
          setMessage(
            "Account created successfully."
          );

          if (onAuthSuccess) {
            onAuthSuccess(data.user);
          }
        } else {
          setMessage(
            "Account created. Please check your email to confirm your account."
          );
        }
      }
    } catch (err) {
      console.error("Authentication error:", err);

      setError(
        err?.message ||
          "Authentication failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode(newMode) {
    setMode(newMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-brand">
          <div className="auth-logo">
            TC
          </div>

          <div>
            <h1>Trade Catalyst</h1>
            <p>
              Trading Performance
            </p>
          </div>
        </div>

        <div className="auth-heading">
          <p className="eyebrow">
            {mode === "login"
              ? "WELCOME BACK"
              : "GET STARTED"}
          </p>

          <h2>
            {mode === "login"
              ? "Sign in to your account"
              : "Create your account"}
          </h2>

          <p>
            {mode === "login"
              ? "Access your trading journal and performance analytics."
              : "Create an account to securely save your trading history."}
          </p>
        </div>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >

          <div className="auth-field">
            <label htmlFor="auth-email">
              Email
            </label>

            <input
              id="auth-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">
              Password
            </label>

            <input
              id="auth-password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              required
            />
          </div>

          {mode === "signup" && (
            <div className="auth-field">
              <label htmlFor="auth-confirm-password">
                Confirm Password
              </label>

              <input
                id="auth-confirm-password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(
                    e.target.value
                  )
                }
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {error && (
            <div className="auth-error">
              {error}
            </div>
          )}

          {message && (
            <div className="auth-success">
              {message}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" ? (
            <>
              <span>
                Don't have an account?
              </span>

              <button
                type="button"
                onClick={() =>
                  switchMode("signup")
                }
              >
                Create Account
              </button>
            </>
          ) : (
            <>
              <span>
                Already have an account?
              </span>

              <button
                type="button"
                onClick={() =>
                  switchMode("login")
                }
              >
                Sign In
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

export default Auth;