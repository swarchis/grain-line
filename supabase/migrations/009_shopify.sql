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
CREATE POLICY "Users can manage their store connections" 
ON public.store_connections FOR ALL 
USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));

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
CREATE POLICY "Users can view their sales data" 
ON public.sales_data FOR SELECT 
USING (brand_id IN (SELECT id FROM public.brands WHERE user_id = auth.uid()));