import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DemoProvider } from './lib/demo-state';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { IssuePage } from './pages/IssuePage';
import { VerifyPage } from './pages/VerifyPage';
import { AdminPage } from './pages/AdminPage';

export function App() {
  return (
    <DemoProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/issue" element={<IssuePage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </BrowserRouter>
    </DemoProvider>
  );
}
