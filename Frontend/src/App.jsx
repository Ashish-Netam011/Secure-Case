import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

function App() {
  const [user, setUser] = useState(() => {
    try {
      return localStorage.getItem("token")
        ? JSON.parse(localStorage.getItem("user")) || null
        : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleSessionExpired = () => setUser(null);
    window.addEventListener("secure-case-session-expired", handleSessionExpired);
    return () => window.removeEventListener("secure-case-session-expired", handleSessionExpired);
  }, []);

  function handleLogin(userData) {
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Dashboard
      user={user}
      onLogout={handleLogout}
    />
  );
}

export default App;