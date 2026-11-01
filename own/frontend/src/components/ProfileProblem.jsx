import { AUTH_STATUS } from "../constants.js";
import { logOut } from "../services/auth.js";

const EXPLANATIONS = {
  [AUTH_STATUS.PROFILE_MISSING]:
    "Your account has no role profile yet. Ask an administrator to create one.",
  [AUTH_STATUS.ROLE_UNKNOWN]:
    "Your profile has a role this app does not recognise. Ask an administrator to correct it.",
  [AUTH_STATUS.PROFILE_ERROR]:
    "Your profile could not be loaded. Check your connection and try again.",
};

export default function ProfileProblem({ status, email, onRetry }) {
  return (
    <main className="container">
      <section className="card login-card">
        <h1>Access unavailable</h1>
        <p>Signed in as {email}.</p>
        <p className="message message-error" role="alert">{EXPLANATIONS[status]}</p>

        <div className="button-row">
          {status === AUTH_STATUS.PROFILE_ERROR && (
            <button type="button" onClick={onRetry}>Try again</button>
          )}
          <button type="button" className="secondary-button" onClick={logOut}>
            Logout
          </button>
        </div>
      </section>
    </main>
  );
}
