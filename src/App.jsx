import "./App.css";
import Header from "./components/Header.jsx";
import LoginForm from "./components/LoginForm.jsx";
import PatientsScreen from "./components/PatientsScreen.jsx";
import ProfileProblem from "./components/ProfileProblem.jsx";
import { AUTH_STATUS } from "./constants.js";
import { useAuthProfile } from "./hooks/useAuthProfile.js";

export default function App() {
  const { status, user, profile, retry } = useAuthProfile();

  if (status === AUTH_STATUS.LOADING) {
    return (
      <main className="container">
        <p>Loading…</p>
      </main>
    );
  }

  if (status === AUTH_STATUS.SIGNED_OUT) {
    return <LoginForm />;
  }

  if (status !== AUTH_STATUS.READY) {
    return <ProfileProblem status={status} email={user.email} onRetry={retry} />;
  }

  return (
    <div className="app">
      <Header profile={profile} />
      <PatientsScreen role={profile.role} />
    </div>
  );
}
