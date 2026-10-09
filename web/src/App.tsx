import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { ScrollManager } from './components/HashLink';
import { RoughFilter } from './components/RoughFilter';
import { CasePage } from './pages/CasePage';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AppDataProvider } from './state/AppData';

// Staff screens load on demand so they never weigh down the public landing page.
const AdminApp = lazy(() => import('./admin/AdminApp'));

/** The app shell. A router (BrowserRouter in the browser, MemoryRouter in tests) goes above it. */
export function App() {
  const { t } = useTranslation();
  return (
    <AppDataProvider>
      <a className="skip-link" href="#main">
        {t('app.skip')}
      </a>
      <RoughFilter />
      <ScrollManager />
      <Header />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route index element={<LandingPage />} />
          <Route path="case/:id" element={<CasePage />} />
          <Route
            path="admin/*"
            element={
              <Suspense
                fallback={
                  <p className="page-loading" role="status">
                    {t('app.loading')}
                  </p>
                }
              >
                <AdminApp />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </AppDataProvider>
  );
}
