import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from './AuthContext.jsx';

const ProductsContext = createContext(null);

export function ProductsProvider({ children }) {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [designs, setDesigns] = useState({});
  const [activeBrand, setActiveBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const uploadedFiles = useRef(new Map());

  useEffect(() => {
    if (!user) {
      setProducts([]);
      setDesigns({});
      setLoading(false);
      return;
    }

    async function loadData() {
      setLoading(true);
      try {
        const { data: brandData } = await supabase
          .from('brands')
          .select('*')
          .eq('user_id', user.id)
          .limit(1)
          .single();
          
        if (brandData) {
          setActiveBrand(brandData);
          
          const { data: prodData } = await supabase
            .from('products')
            .select('*')
            .eq('brand_id', brandData.id)
            .order('created_at', { ascending: false });
            
          setProducts(prodData || []);

          const { data: designData } = await supabase
            .from('designs')
            .select('*');
            
          const designsMap = {};
          (designData || []).forEach(d => {
            designsMap[d.product_id] = {
              garmentType: d.garment_type,
              silhouette: d.silhouette,
              baseType: d.base_type,
              colorway: d.colorway,
              status: d.status,
              layers: [{ name: d.base_type === 'upload' ? 'Uploaded mockup' : 'Silhouette base', visible: true }],
              analysis: d.analysis, // <--- Now pulling the real analysis!
            };
          });
          setDesigns(designsMap);
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  const moveProduct = async (id, stage) => {
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, stage } : p)));
    const { error } = await supabase.from('products').update({ stage }).eq('id', id);
    if (error) console.error('Failed to move product', error);
  };

  // General-purpose product field update — budget, name, risk, etc. New products
  // start at budget: 0 with no form anywhere to set it, so this is what backs
  // whatever UI ends up giving founders a place to enter it.
  const updateProduct = async (id, updates) => {
    const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single();
    if (error) throw error;
    setProducts(prev => prev.map(p => (p.id === id ? data : p)));
    return data;
  };

  const createDesign = async ({ garmentType, baseType, silhouette, colorway, file }) => {
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
        readiness: 4
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
        status: 'Sketching'
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
      },
    }));

    return productData.id;
  };

  const getUploadedFile = id => uploadedFiles.current.get(id) || null;

  return (
    <ProductsContext.Provider value={{ products, moveProduct, updateProduct, designs, createDesign, getUploadedFile, activeBrand, loading }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used inside ProductsProvider');
  return ctx;
}