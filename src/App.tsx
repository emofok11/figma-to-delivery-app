import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import AuthGate from './components/AuthGate';
import Dashboard from './components/Dashboard';
import TemplateLibrary from './components/TemplateLibrary';
import UserSettings from './components/UserSettings';

type AppView = 'dashboard' | 'ui-delivery-template' | 'user-settings';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('dashboard');

  const handleEnterModule = (moduleId: string) => {
    if (moduleId === 'ui-delivery-template') {
      setCurrentView('ui-delivery-template');
    }
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
  };

  const handleOpenSettings = () => {
    setCurrentView('user-settings');
  };

  return (
    <AuthProvider>
      <AuthGate>
        {currentView === 'dashboard' && (
          <Dashboard onEnterModule={handleEnterModule} onOpenSettings={handleOpenSettings} />
        )}
        {currentView === 'ui-delivery-template' && (
          <TemplateLibrary onBackToDashboard={handleBackToDashboard} />
        )}
        {currentView === 'user-settings' && (
          <UserSettings onBack={handleBackToDashboard} />
        )}
      </AuthGate>
    </AuthProvider>
  );
};

export default App;