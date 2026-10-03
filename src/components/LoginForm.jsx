import { useState } from "react";
import { describeError } from "../errors.js";
import { logIn } from "../services/auth.js";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await logIn(email.trim(), password);
    } catch (loginError) {
      console.error("Login failed:", loginError);
      setError(describeError(loginError, "Login failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container">
      <section className="card login-card">
        <h1>Patient Management</h1>
        <p>Sign in with your clinic account.</p>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && <p className="message message-error" role="alert">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
