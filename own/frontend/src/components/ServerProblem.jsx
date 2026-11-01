export default function ServerProblem({ onRetry }) {
  return (
    <main className="container">
      <section className="card login-card">
        <h1>Server unavailable</h1>
        <p className="message message-error" role="alert">
          Cannot reach the server. Check your connection and try again.
        </p>

        <div className="button-row">
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      </section>
    </main>
  );
}
