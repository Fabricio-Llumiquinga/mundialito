import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@heroui/react';
import { Calendar, Target, Trophy, BarChart3, Menu, X, LogOut, HelpCircle } from 'lucide-react';
import { useAuth } from '../auth/auth-context';

const NAV_ITEMS = [
  { to: '/matches', label: 'Partidos', icon: Calendar },
  { to: '/predictions', label: 'Predecir', icon: Target },
  { to: '/leaderboard', label: 'Clasificación', icon: Trophy },
  { to: '/dashboard', label: 'Panel', icon: BarChart3 },
  { to: '/rules', label: 'Reglas', icon: HelpCircle },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Thin top bar */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          {/* Brand */}
          <NavLink to="/" className="flex items-center gap-2">
            <img src="/a2c-avatar.png" alt="Any2Cloud" className="w-7 h-7 rounded-full" />
            <span className="font-display text-sm font-bold uppercase tracking-wide text-gray-900">
              A2C Mundialito 2026
            </span>
          </NavLink>

          {/* Desktop Navigation */}
          <div className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                      isActive
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </div>

          {/* User / Logout */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-gray-500">{user?.email}</span>
            <Button
              variant="light"
              size="sm"
              onPress={handleLogout}
              startContent={<LogOut className="w-3.5 h-3.5" />}
              className="text-xs text-gray-500 hover:text-red-600 min-w-0 h-8 px-2"
            >
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </Button>
            {/* Mobile menu toggle */}
            <button
              className="sm:hidden text-gray-600 hover:text-gray-900 p-1.5"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Alternar menú de navegación"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-100 bg-white">
            <div className="px-4 py-2 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors w-full ${
                        isActive
                          ? 'text-blue-600 bg-blue-50'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                );
              })}
              <div className="pt-2 border-t border-gray-100 mt-2">
                <span className="block px-3 py-2 text-xs text-gray-500">{user?.email}</span>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content - full width for page headers */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
