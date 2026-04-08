import React from 'react';
import TemplateLibrary from './components/TemplateLibrary';
import AuthGate from './components/AuthGate';

const App: React.FC = () => {
  return (
    <AuthGate>
      <TemplateLibrary />
    </AuthGate>
  );
};

export default App;