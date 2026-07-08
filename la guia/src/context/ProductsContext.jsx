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
  
  // Keep raw files in memory for current session
  const uploadedFiles = useRef(new Map());

  // Load Brand and Products on boot
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
        // 1. Get the user's brand
        const { data: brandData } = await supabase
          .from('brands')
          .select('*')
          .eq('user_id', user.id)
          .limit(1)
          .single();
          
        if (brandData) {
          setActiveBrand(brandData);
          
          // 2. Get Products for this brand
          const { data: prodData } = await supabase
            .from('products')
            .select('*')
            .eq('brand_id', brandData.id)
            .order('created_at', { ascending: false });
            
          setProducts(prodData || []);

          // 3. Get Designs for these products
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
              analysis: null,
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
    // Optimistic UI update
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, stage } : p)));
    
    // DB Update
    const { error } = await supabase
      .from('products')
      .update({ stage })
      .eq('id', id);
      
    if (error) {
      console.error('Failed to move product', error);
      // Revert if needed (omitted for brevity)
    }
  };

  const createDesign = async ({ garmentType, baseType, silhouette, colorway, file }) => {
    if (!activeBrand) throw new Error("No active brand found");

    // 1. Insert Product
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

    // 2. Insert Design
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

    // Update local state
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
    <ProductsContext.Provider value={{ products, moveProduct, designs, createDesign, getUploadedFile, activeBrand, loading }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used inside ProductsProvider');
  return ctx;
}