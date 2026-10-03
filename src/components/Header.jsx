import { logOut } from "../services/auth.js";

export default function Header({ profile }) {
  return (
    <header className="header">
      <div>
        <h1>Patient Management</h1>
        <p>Firebase Backend Onboarding</p>
      </div>

      <div className="user-info">
        <strong>{profile.name}</strong>
        <span>Role: {profile.role}</span>
        <button type="button" onClick={logOut}>Logout</button>
      </div>
    </header>
  );
}
