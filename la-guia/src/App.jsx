import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ProductsProvider } from './context/ProductsContext.jsx';
import { VendorsProvider } from './context/VendorsContext.jsx';

import Welcome from './pages/auth/Welcome.jsx';
import SignUp from './pages/auth/SignUp.jsx';
import LogIn from './pages/auth/LogIn.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';

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
import MaterialLibrary from './pages/MaterialLibrary.jsx';
import MaterialDetail from './pages/MaterialDetail.jsx';
import ProductionOrders from './pages/ProductionOrders.jsx';
import ProductionOrderDetail from './pages/ProductionOrderDetail.jsx';
import ReadinessReview from './pages/ReadinessReview.jsx';
import SalesDashboard from './pages/SalesDashboard.jsx';
import ProductInsights from './pages/ProductInsights.jsx';
import ContentHub from './pages/ContentHub.jsx';
import Settings from './pages/Settings.jsx';
import NotificationsInbox from './pages/NotificationsInbox.jsx';

// Protects routes from unauthenticated users
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // Or a subtle loading spinner
  
  if (!user) {
    return <Navigate to="/welcome" state={{ from: location }} replace />;
  }

  return children;
}

function AppShell() {
  return (
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
          <Route path="/materials" element={<MaterialLibrary />} />
          <Route path="/materials/:id" element={<MaterialDetail />} />
          <Route path="/production" element={<ProductionOrders />} />
          <Route path="/production/:id" element={<ProductionOrderDetail />} />
          <Route path="/readiness" element={<ReadinessReview />} />
          <Route path="/sales" element={<SalesDashboard />} />
          <Route path="/products/:id/performance" element={<ProductInsights />} />
          <Route path="/content" element={<ContentHub />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/notifications" element={<NotificationsInbox />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProductsProvider>
        <VendorsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/login" element={<LogIn />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              } />
            </Routes>
          </BrowserRouter>
        </VendorsProvider>
      </ProductsProvider>
    </AuthProvider>
  );
}