import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import { Activity } from 'lucide-react';

export default function LoginPage({ onLoginSuccess }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Activity size={40} className="text-gray-900" />
            <h1 className="text-4xl font-bold text-gray-900">SmartTask</h1>
          </div>
          <p className="text-gray-600">Management System</p>
        </div>

        <div className="card card-elevated">
          <LoginForm onLoginSuccess={onLoginSuccess} />
        </div>

        <p className="text-center text-gray-600 mt-4">
          Don't have an account? <Link to="/register" className="text-gray-900 font-semibold hover:underline">Register here</Link>
        </p>
      </div>
    </div>
  );
}