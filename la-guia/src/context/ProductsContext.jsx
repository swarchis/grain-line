import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from './AuthContext.jsx';

const ProductsContext = createContext(null);

function lastBrandKey(userId) {
  return `grainline_last_brand_${userId}`;
}

export function ProductsProvider({ children }) {
  const { user } = useAuth();
  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [designs, setDesigns] = useState({});
  const [activeBrand, setActiveBrandState] = useState(null);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loading, setLoading] = useState(true);

  const uploadedFiles = useRef(new Map());

  // Load every brand this user owns or has been added to as a team member,
  // then pick the active one — whichever was last used on this device, or
  // the first available. Re-runs on login/logout only; switching brands
  // afterward never re-hits this query.
  useEffect(() => {
    if (!user) {
      setBrands([]);
      setActiveBrandState(null);
      setLoadingBrands(false);
      return;
    }

    async function loadBrands() {
      setLoadingBrands(true);
      try {
        const { data: owned, error: ownedError } = await supabase
          .from('brands')
          .select('*')
          .eq('user_id', user.id);
        if (ownedError) throw ownedError;

        const { data: memberRows, error: memberError } = await supabase
          .from('brand_members')
          .select('brand_id, role, brands(*)')
          .eq('user_id', user.id)
          .eq('status', 'active');
        if (memberError) throw memberError;

        const memberBrands = (memberRows || [])
          .map(m => m.brands && { ...m.brands, memberRole: m.role })
          .filter(Boolean);

        const seen = new Set();
        const allBrands = [...(owned || []).map(b => ({ ...b, memberRole: 'owner' })), ...memberBrands]
          .filter(b => (seen.has(b.id) ? false : (seen.add(b.id), true)));

        setBrands(allBrands);

        const lastId = localStorage.getItem(lastBrandKey(user.id));
        const preferred = allBrands.find(b => b.id === lastId) || allBrands[0] || null;
        setActiveBrandState(preferred);
      } catch (err) {
        console.error('Error loading brands:', err);
      } finally {
        setLoadingBrands(false);
      }
    }

    loadBrands();
  }, [user]);

  // Load everything scoped to whichever brand is active — reruns whenever
  // the founder switches brands, not just on login.
  useEffect(() => {
    if (!activeBrand) {
      setProducts([]);
      setCollections([]);
      setDesigns({});
      setLoading(false);
      return;
    }

    async function loadBrandData() {
      setLoading(true);
      try {
        const { data: collData } = await supabase
          .from('collections')
          .select('*')
          .eq('brand_id', activeBrand.id)
          .order('created_at', { ascending: false });
        setCollections(collData || []);

        const { data: prodData } = await supabase
          .from('products')
          .select('*')
          .eq('brand_id', activeBrand.id)
          .order('created_at', { ascending: false });
        setProducts(prodData || []);

        const productIds = (prodData || []).map(p => p.id);
        const designsMap = {};
        if (productIds.length) {
          const { data: designData } = await supabase
            .from('designs')
            .select('*')
            .in('product_id', productIds);

          (designData || []).forEach(d => {
            designsMap[d.product_id] = {
              garmentType: d.garment_type,
              silhouette: d.silhouette,
              baseType: d.base_type,
              colorway: d.colorway,
              status: d.status,
              layers: [{ name: d.base_type === 'upload' ? 'Uploaded mockup' : 'Silhouette base', visible: true }],
              analysis: d.analysis,
              aiPaths: d.ai_paths || null,
            };
          });
        }
        setDesigns(designsMap);
      } catch (err) {
        console.error('Error loading brand data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadBrandData();
  }, [activeBrand?.id]);

  const switchBrand = (brandId) => {
    const next = brands.find(b => b.id === brandId);
    if (!next) return;
    setActiveBrandState(next);
    if (user) localStorage.setItem(lastBrandKey(user.id), brandId);
  };

  const createBrand = async (name) => {
    if (!user) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('brands')
      .insert([{ user_id: user.id, name }])
      .select()
      .single();
    if (error) throw error;
    const withRole = { ...data, memberRole: 'owner' };
    setBrands(prev => [...prev, withRole]);
    switchBrand(data.id);
    return withRole;
  };

  const moveProduct = async (id, stage) => {
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, stage } : p)));
    const { error } = await supabase.from('products').update({ stage }).eq('id', id);
    if (error) console.error('Failed to move product', error);
  };

  const updateProduct = async (id, updates) => {
    const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single();
    if (error) throw error;
    setProducts(prev => prev.map(p => (p.id === id ? data : p)));
    return data;
  };

  const toggleFavorite = async (id) => {
    const current = products.find(p => p.id === id);
    if (!current) return;
    return updateProduct(id, { is_favorite: !current.is_favorite });
  };

  const createCollection = async ({ name, launchWindow }) => {
    if (!activeBrand) throw new Error("No active brand");
    const { data, error } = await supabase
      .from('collections')
      .insert([{ brand_id: activeBrand.id, name, launch_window: launchWindow }])
      .select()
      .single();
    if (error) throw error;
    setCollections(prev => [data, ...prev]);
    return data;
  };

  const updateBrand = async (updates) => {
    if (!activeBrand) throw new Error("No active brand");
    const { data, error } = await supabase
      .from('brands')
      .update(updates)
      .eq('id', activeBrand.id)
      .select()
      .single();
    if (error) throw error;
    const withRole = { ...data, memberRole: activeBrand.memberRole };
    setActiveBrandState(withRole);
    setBrands(prev => prev.map(b => (b.id === withRole.id ? withRole : b)));
    return withRole;
  };

  const createDesign = async ({ garmentType, baseType, silhouette, colorway, file, collectionId, aiPaths }) => {
    if (!activeBrand) throw new Error("No active brand found");

    const { data: productData, error: prodError } = await supabase
      .from('products')
      .insert([{
        brand_id: activeBrand.id,
        name: `New ${garmentType}`,
        category: garmentType,
        stage: 'concept',
        risk: 'Balanced',
        budget: 0,
        readiness: 4,
        collection_id: collectionId || null
      }])
      .select()
      .single();

    if (prodError) throw prodError;

    const { error: designError } = await supabase
      .from('designs')
      .insert([{
        product_id: productData.id,
        garment_type: garmentType,
        base_type: baseType,
        silhouette: silhouette || null,
        colorway: colorway || '—',
        status: 'Sketching',
        ai_paths: aiPaths || null
      }]);

    if (designError) throw designError;

    if (file) uploadedFiles.current.set(productData.id, file);

    setProducts(prev => [productData, ...prev]);
    setDesigns(prev => ({
      ...prev,
      [productData.id]: {
        garmentType, silhouette: silhouette || null, baseType, colorway: colorway || '—',
        status: 'Sketching',
        layers: [{ name: baseType === 'upload' ? 'Uploaded mockup' : 'Silhouette base', visible: true }],
        analysis: null,
        aiPaths: aiPaths || null,
      },
    }));

    return productData.id;
  };

  const getUploadedFile = id => uploadedFiles.current.get(id) || null;

  return (
    <ProductsContext.Provider value={{
      products, collections, moveProduct, updateProduct, toggleFavorite, designs, createDesign, createCollection,
      updateBrand, getUploadedFile, activeBrand, brands, switchBrand, createBrand,
      loading: loading || loadingBrands,
    }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used inside ProductsProvider');
  return ctx;
}
