import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { TransferPage } from './pages/TransferPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { Navbar } from './components/Navbar';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route
            path="/*"
            element={
              <div className="min-h-screen bg-slate-50">
                <Navbar />
                <main>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/transfer" element={<TransferPage />} />
                    <Route path="/transactions" element={<HistoryPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;