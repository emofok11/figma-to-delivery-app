import React, { useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import AuthGate from './components/AuthGate';
import Dashboard from './components/Dashboard';
import TemplateLibrary from './components/TemplateLibrary';

type AppView = 'dashboard' | 'ui-delivery-template';

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

  return (
    <AuthProvider>
      <AuthGate>
        {currentView === 'dashboard' && (
          <Dashboard onEnterModule={handleEnterModule} />
        )}
        {currentView === 'ui-delivery-template' && (
          <TemplateLibrary onBackToDashboard={handleBackToDashboard} />
        )}
      </AuthGate>
    </AuthProvider>
  );
};

export default App;