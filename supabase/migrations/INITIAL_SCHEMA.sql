-- ATELIER INITIAL SCHEMA
-- Transcribed from Dashboard Visualizer + Recent Feature Updates

-- 1. BRANDS
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    global_risk TEXT DEFAULT 'Balanced',
    created_at TIMESTAMPTZ DEFAULT now(),
    target_customer TEXT,
    quality_tier TEXT,
    budget_philosophy TEXT,
    sustainability TEXT,
    manufacturer_preferences TEXT,
    notification_settings JSONB DEFAULT '{
      "readiness": true,
      "quotes": true,
      "materials": true,
      "timeline": true
    }'::jsonb,
    plan_tier TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT
);

-- 2. COLLECTIONS
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    launch_window TEXT,
    timeline_conflict BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    stage TEXT DEFAULT 'concept',
    risk TEXT DEFAULT 'Balanced',
    budget NUMERIC DEFAULT 0,
    readiness INT4 DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    financials JSONB DEFAULT '{}'::jsonb,
    collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL
);

-- 4. DESIGNS
CREATE TABLE IF NOT EXISTS public.designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    garment_type TEXT,
    silhouette TEXT,
    base_type TEXT,
    colorway TEXT,
    status TEXT DEFAULT 'Sketching',
    created_at TIMESTAMPTZ DEFAULT now(),
    analysis JSONB DEFAULT '{}'::jsonb,
    ai_paths JSONB DEFAULT NULL
);

-- 5. TECH PACKS
CREATE TABLE IF NOT EXISTS public.tech_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    bom JSONB DEFAULT '[]'::jsonb,
    measurements JSONB DEFAULT '[]'::jsonb,
    material_warnings JSONB DEFAULT '[]'::jsonb,
    readiness_checklist JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now(),
    image_url TEXT,
    UNIQUE(product_id)
);

-- 6. VENDORS
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    location TEXT,
    label TEXT DEFAULT 'Imported by user',
    rating NUMERIC,
    moq INT4,
    lead_time TEXT,
    specialties JSONB DEFAULT '[]'::jsonb,
    source_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    favorited BOOLEAN DEFAULT false,
    blocked BOOLEAN DEFAULT false,
    notes TEXT
);

-- 7. QUOTES
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'Requested',
    amount NUMERIC,
    message TEXT,
    requested_at TIMESTAMPTZ DEFAULT now(),
    preferences JSONB DEFAULT '{}'::jsonb
);

-- 8. PRODUCTION ORDERS
CREATE TABLE IF NOT EXISTS public.production_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    po_number TEXT,
    units INT4,
    due_date DATE,
    stage TEXT DEFAULT 'Sampling',
    checkpoints JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. MATERIALS
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT,
    risk_level TEXT,
    warning TEXT,
    handling_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    type TEXT DEFAULT 'info', -- 'success', 'warning', 'info'
    read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own brand notifications" ON public.notifications FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));
CREATE POLICY "Users can update their own brand notifications" ON public.notifications FOR UPDATE USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert their own brand notifications" ON public.notifications FOR INSERT WITH CHECK (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

-- 11. USER PREFERENCES
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    theme TEXT DEFAULT 'light',
    onboarding_completed BOOLEAN DEFAULT false,
    show_shortcut_hints BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own preferences" ON public.user_preferences FOR ALL USING (user_id = auth.uid());

-- 12. TEAM MEMBERS
CREATE TABLE IF NOT EXISTS public.brand_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    invited_email TEXT NOT NULL,
    role TEXT DEFAULT 'viewer',
    status TEXT DEFAULT 'pending',
    invited_at TIMESTAMPTZ DEFAULT now(),
    joined_at TIMESTAMPTZ,
    UNIQUE(brand_id, invited_email)
);

ALTER TABLE public.brand_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view members of their brands" ON public.brand_members FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid() OR id IN (SELECT brand_id FROM public.brand_members WHERE user_id = auth.uid() AND status = 'active')));
CREATE POLICY "Admins can manage team members" ON public.brand_members FOR ALL USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid() OR id IN (SELECT brand_id FROM public.brand_members WHERE user_id = auth.uid() AND role IN ('admin', 'owner'))));

-- 13. AI USAGE
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their brand's AI usage" ON public.ai_usage_log FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid() OR id IN (SELECT brand_id FROM public.brand_members WHERE user_id = auth.uid() AND status = 'active')));
CREATE POLICY "Users can log their brand's AI usage" ON public.ai_usage_log FOR INSERT WITH CHECK (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid() OR id IN (SELECT brand_id FROM public.brand_members WHERE user_id = auth.uid() AND status = 'active')));

-- 14. SHOPIFY INTEGRATION
CREATE TABLE IF NOT EXISTS public.store_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    platform TEXT DEFAULT 'shopify',
    shop_domain TEXT NOT NULL,
    access_token TEXT,
    connected_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(brand_id, platform)
);

ALTER TABLE public.store_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their store connections" ON public.store_connections FOR ALL USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid() OR id IN (SELECT brand_id FROM public.brand_members WHERE user_id = auth.uid() AND status = 'active')));

CREATE TABLE IF NOT EXISTS public.sales_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    revenue NUMERIC DEFAULT 0,
    orders_count INT4 DEFAULT 0,
    UNIQUE(brand_id, product_id, month)
);

ALTER TABLE public.sales_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their sales data" ON public.sales_data FOR SELECT USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid() OR id IN (SELECT brand_id FROM public.brand_members WHERE user_id = auth.uid() AND status = 'active')));