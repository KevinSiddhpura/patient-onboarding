import { useLogout } from "../hooks/useLogout.js";

export default function Header({ profile }) {
  const { logOut, error } = useLogout();

  return (
    <>
      <header className="header">
        <div>
          <h1>Patient Management</h1>
          <p>Non Firebase Backend Onboarding</p>
        </div>

        <div className="user-info">
          <strong>{profile.name}</strong>
          <span>Role: {profile.role}</span>
          <button type="button" onClick={logOut}>Logout</button>
        </div>
      </header>
      {error && <p className="message message-error header-error" role="alert">{error}</p>}
    </>
  );
}
