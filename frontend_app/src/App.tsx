import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Workspace from './pages/Workspace';
import './assets/styles/main.css';

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('imagoToken');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/workspace" 
          element={
            <RequireAuth>
              <Workspace />
            </RequireAuth>
          } 
        />
        <Route path="/" element={<Navigate to="/workspace" replace />} />
      </Routes>
    </Router>
  );
}
