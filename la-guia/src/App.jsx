import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ProductsProvider } from './context/ProductsContext.jsx';
import { VendorsProvider } from './context/VendorsContext.jsx';
import { ProductionProvider } from './context/ProductionContext.jsx';
import { SamplingProvider } from './context/SamplingContext.jsx';
import { NotificationsProvider } from './context/NotificationsContext.jsx';
import { UserPreferencesProvider } from './context/UserPreferencesContext.jsx';
import { MaterialsProvider } from './context/MaterialsContext.jsx';
import { TeamProvider } from './context/TeamContext.jsx';
import { AIUsageProvider } from './context/AIUsageContext.jsx';
import { OnboardingProvider } from './context/OnboardingContext.jsx';
import { AppUIProvider, useAppUI } from './context/AppUIContext.jsx';
import { SalesProvider } from './context/SalesContext.jsx';
import { ContentProvider } from './context/ContentContext.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import OnboardingOverlay from './components/OnboardingOverlay.jsx';
import ShortcutsHelpModal from './components/ShortcutsHelpModal.jsx';
import FloatingChat from './components/FloatingChat.jsx';
import { useKeyboardShortcuts } from './lib/useKeyboardShortcuts.js';

import Welcome from './pages/auth/Welcome.jsx';
import SignUp from './pages/auth/SignUp.jsx';
import LogIn from './pages/auth/LogIn.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import UpdatePassword from './pages/auth/UpdatePassword.jsx';

import Home from './pages/Home.jsx';
import Design from './pages/Design.jsx';
import DesignDetail from './pages/DesignDetail.jsx';
import TechPackList from './pages/TechPackList.jsx';
import TechPackDetail from './pages/TechPackDetail.jsx';
import Collections from './pages/Collections.jsx';
import CollectionDetail from './pages/CollectionDetail.jsx';
import VendorDiscovery from './pages/VendorDiscovery.jsx';
import VendorDetail from './pages/VendorDetail.jsx';
import QuoteTracker from './pages/QuoteTracker.jsx';
import QuoteDetail from './pages/QuoteDetail.jsx';
import MaterialLibrary from './pages/MaterialLibrary.jsx';
import MaterialDetail from './pages/MaterialDetail.jsx';
import ProductionOrders from './pages/ProductionOrders.jsx';
import ProductionOrderDetail from './pages/ProductionOrderDetail.jsx';
import Sampling from './pages/Sampling.jsx';
import SampleDetail from './pages/SampleDetail.jsx';
import ReadinessReview from './pages/ReadinessReview.jsx';
import SalesDashboard from './pages/SalesDashboard.jsx';
import FinancialTools from './pages/FinancialTools.jsx';
import ProductInsights from './pages/ProductInsights.jsx';
import ContentHub from './pages/ContentHub.jsx';
import Settings from './pages/Settings.jsx';
import NotificationsInbox from './pages/NotificationsInbox.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import TermsOfService from './pages/TermsOfService.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/welcome" state={{ from: location }} replace />;
  return children;
}

function AppShellInner() {
  const { focusSearch, helpOpen, openHelp, closeHelp } = useAppUI();
  useKeyboardShortcuts({ onOpenPalette: focusSearch, onOpenHelp: openHelp });

  return (
    <OnboardingProvider>
      <div className="shell">
        <Sidebar />
        <div className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/design" element={<Design />} />
            <Route path="/design/:id" element={<DesignDetail />} />
            <Route path="/tech-packs" element={<TechPackList />} />
            <Route path="/tech-packs/:id" element={<TechPackDetail />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/collections/:id" element={<CollectionDetail />} />
            <Route path="/vendors" element={<VendorDiscovery />} />
            <Route path="/vendors/:id" element={<VendorDetail />} />
            <Route path="/quotes" element={<QuoteTracker />} />
            <Route path="/quotes/:id" element={<QuoteDetail />} />
            <Route path="/materials" element={<MaterialLibrary />} />
            <Route path="/materials/:id" element={<MaterialDetail />} />
            <Route path="/sampling" element={<Sampling />} />
            <Route path="/sampling/:productId" element={<SampleDetail />} />
            <Route path="/production" element={<ProductionOrders />} />
            <Route path="/production/:id" element={<ProductionOrderDetail />} />
            <Route path="/readiness" element={<ReadinessReview />} />
            <Route path="/sales" element={<SalesDashboard />} />
            <Route path="/financial" element={<FinancialTools />} />
            <Route path="/products/:id/performance" element={<ProductInsights />} />
            <Route path="/content" element={<ContentHub />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/notifications" element={<NotificationsInbox />} />
            
            {/* CATCH-ALL: Prevents the "Blank White Screen" if a user typos a URL */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <OnboardingOverlay />
        <ShortcutsHelpModal open={helpOpen} onClose={closeHelp} />
        <FloatingChat />
      </div>
    </OnboardingProvider>
  );
}

function AppShell() {
  return (
    <AppUIProvider>
      <AppShellInner />
    </AppUIProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <UserPreferencesProvider>
      <ProductsProvider>
        <VendorsProvider>
          <ProductionProvider>
          <SamplingProvider>
            <NotificationsProvider>
            <MaterialsProvider>
            <TeamProvider>
            <AIUsageProvider>
            <ChatProvider>
            <SalesProvider>
            <ContentProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/welcome" element={<Welcome />} />
                  <Route path="/signup" element={<SignUp />} />
                  <Route path="/login" element={<LogIn />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/update-password" element={<UpdatePassword />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/*" element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  } />
                </Routes>
              </BrowserRouter>
            </ContentProvider>
            </SalesProvider>
            </ChatProvider>
            </AIUsageProvider>
            </TeamProvider>
            </MaterialsProvider>
            </NotificationsProvider>
          </SamplingProvider>
          </ProductionProvider>
        </VendorsProvider>
      </ProductsProvider>
      </UserPreferencesProvider>
    </AuthProvider>
  );
}