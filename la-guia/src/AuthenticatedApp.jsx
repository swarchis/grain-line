import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';

import { ProductsProvider } from './context/ProductsContext.jsx';
import { VendorsProvider } from './context/VendorsContext.jsx';
import { ProductionProvider } from './context/ProductionContext.jsx';
import { SamplingProvider } from './context/SamplingContext.jsx';
import { NotificationsProvider } from './context/NotificationsContext.jsx';
import { MaterialsProvider } from './context/MaterialsContext.jsx';
import { TeamProvider } from './context/TeamContext.jsx';
import { AIUsageProvider } from './context/AIUsageContext.jsx';
import { OnboardingProvider } from './context/OnboardingContext.jsx';
import { AppUIProvider, useAppUI } from './context/AppUIContext.jsx';
import { SalesProvider } from './context/SalesContext.jsx';
import { ContentProvider } from './context/ContentContext.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import { InfluencersProvider } from './context/InfluencersContext.jsx';
import { PinnedProvider } from './context/PinnedContext.jsx';
import OnboardingOverlay from './components/OnboardingOverlay.jsx';
import ShortcutsHelpModal from './components/ShortcutsHelpModal.jsx';
import FloatingChat from './components/FloatingChat.jsx';
import OutOfCreditsModal from './components/OutOfCreditsModal.jsx';
import { useKeyboardShortcuts } from './lib/useKeyboardShortcuts.js';

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

/* The entire authenticated app — every data provider, all app chrome, and all
   route pages — lives here so it can be code-split into its own chunk. Logged-
   out visitors on the landing page never download any of it, and none of these
   data providers mount until a user is actually signed in. */

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
        <OutOfCreditsModal />
      </div>
    </OnboardingProvider>
  );
}

export default function AuthenticatedApp() {
  return (
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
                          <InfluencersProvider>
                            <PinnedProvider>
                              <AppUIProvider>
                                <AppShellInner />
                              </AppUIProvider>
                            </PinnedProvider>
                          </InfluencersProvider>
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
  );
}
