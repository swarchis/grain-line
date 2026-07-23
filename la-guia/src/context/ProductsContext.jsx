import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from './AuthContext.jsx';
import { uploadDesignImage, PSD_VERSION_LABEL } from '../lib/designImages.js';
import { setActiveBrandId } from '../lib/aiApi.js';

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
  const [categories, setCategories] = useState([]);
  const [archivedProducts, setArchivedProducts] = useState([]);
  const [activeBrand, setActiveBrandState] = useState(null);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loading, setLoading] = useState(true);
  const [productAssets, setProductAssets] = useState({});

  const uploadedFiles = useRef(new Map());

  // Keep the AI API helper's brand id in sync so metered calls carry brandId.
  useEffect(() => { setActiveBrandId(activeBrand?.id || null); }, [activeBrand?.id]);

  // Load every brand this user owns or has been added to as a team member
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

  // Load everything scoped to whichever brand is active
  useEffect(() => {
    if (!activeBrand) {
      setProducts([]);
      setCollections([]);
      setDesigns({});
      setCategories([]);
      setArchivedProducts([]);
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

        const catRes = await supabase.from('categories').select('*').eq('brand_id', activeBrand.id).order('name', { ascending: true });
        setCategories(catRes.error ? [] : (catRes.data || []));

        let prodData;
        const filtered = await supabase.from('products').select('*').eq('brand_id', activeBrand.id).neq('status', 'archived').order('created_at', { ascending: false }).limit(500);
        if (filtered.error) {
          const unfiltered = await supabase.from('products').select('*').eq('brand_id', activeBrand.id).order('created_at', { ascending: false }).limit(500);
          prodData = unfiltered.data;
        } else {
          prodData = filtered.data;
        }
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
              fabricTags: d.fabric_tags || [],
            };
          });

          // Attach each design's newest saved snapshot as a preview image, in
          // one batched query. Without this, list previews fall back to vector
          // icons — which meant AI-generated silhouettes (no vector data, no
          // template) rendered as a generic tee.
          const { data: versionData } = await supabase
            .from('design_versions')
            .select('product_id, image_url, label, created_at')
            .in('product_id', productIds)
            .order('created_at', { ascending: false });
          (versionData || []).forEach(v => {
            if (v.label === PSD_VERSION_LABEL) return; // working file, not an image
            const entry = designsMap[v.product_id];
            if (entry && !entry.previewUrl) entry.previewUrl = v.image_url; // rows arrive newest-first
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
    supabase.from('product_stage_history').insert([{ product_id: id, stage }]).then(({ error: histErr }) => {
      if (histErr) console.error('Failed to log stage history', histErr);
    });
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

  const updateDesignStatus = async (productId, status) => {
    const { error } = await supabase.from('designs').update({ status }).eq('product_id', productId);
    if (error) throw error;
    setDesigns(prev => (prev[productId] ? { ...prev, [productId]: { ...prev[productId], status } } : prev));
  };

  const updateDesignFabricTags = async (productId, fabricTags) => {
    const { error } = await supabase.from('designs').update({ fabric_tags: fabricTags }).eq('product_id', productId);
    if (error) throw error;
    setDesigns(prev => (prev[productId] ? { ...prev, [productId]: { ...prev[productId], fabricTags } } : prev));
  };

  const deleteProduct = async (id) => {
    // 1. Clean up Supabase Storage before deleting the DB row
    try {
      const pathsToDelete = [];
      
      const { data: tp } = await supabase.from('tech_packs').select('image_url').eq('product_id', id).maybeSingle();
      if (tp?.image_url) pathsToDelete.push(tp.image_url.split('/').pop());

      const { data: dv } = await supabase.from('design_versions').select('image_url').eq('product_id', id);
      (dv || []).forEach(v => v.image_url && pathsToDelete.push(v.image_url.split('/').pop()));

      const { data: d } = await supabase.from('designs').select('variants, moodboard').eq('product_id', id).maybeSingle();
      (d?.variants || []).forEach(v => v.url && pathsToDelete.push(v.url.split('/').pop()));
      (d?.moodboard || []).forEach(m => m.url && pathsToDelete.push(m.url.split('/').pop()));

      const { data: pa } = await supabase.from('product_assets').select('file_url').eq('product_id', id);
      (pa || []).forEach(a => a.file_url && pathsToDelete.push(a.file_url.split('/').pop()));

      if (pathsToDelete.length > 0) {
        await supabase.storage.from('mockups').remove(pathsToDelete);
      }
    } catch (cleanupErr) {
      console.error('Failed to cleanup storage, but continuing with product deletion:', cleanupErr);
    }

    // 2. Delete the DB row
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    setProducts(prev => prev.filter(p => p.id !== id));
    setDesigns(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const createCategory = async (name) => {
    if (!activeBrand) throw new Error('No active brand');
    const { data, error } = await supabase
      .from('categories')
      .insert([{ brand_id: activeBrand.id, name }])
      .select()
      .single();
    if (error) throw error;
    setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    return data;
  };

  const deleteCategory = async (id) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const duplicateProduct = async (id) => {
    const source = products.find(p => p.id === id) || archivedProducts.find(p => p.id === id);
    if (!source) throw new Error('Product not found');

    const { id: _sourceId, created_at: _createdAt, ...rest } = source;
    const { data: newProduct, error: prodError } = await supabase
      .from('products')
      .insert([{ ...rest, name: `${source.name} (Copy)`, status: 'active', is_favorite: false }])
      .select()
      .single();
    if (prodError) throw prodError;

    const sourceDesign = designs[id];
    if (sourceDesign) {
      const { error: designError } = await supabase
        .from('designs')
        .insert([{
          product_id: newProduct.id,
          garment_type: sourceDesign.garmentType,
          base_type: sourceDesign.baseType,
          silhouette: sourceDesign.silhouette,
          colorway: sourceDesign.colorway,
          status: 'Sketching',
          ai_paths: sourceDesign.aiPaths || null,
        }]);
      if (designError) {
        console.error('Failed to duplicate design', designError);
      } else {
        setDesigns(prev => ({ ...prev, [newProduct.id]: { ...sourceDesign, status: 'Sketching' } }));
      }
    }

    supabase.from('product_stage_history').insert([{ product_id: newProduct.id, stage: newProduct.stage }]).then(({ error: histErr }) => {
      if (histErr) console.error('Failed to log stage history', histErr);
    });

    // Duplicate deliberately doesn't clone the tech pack or AI Studio version
    // history (those are meant to be built fresh for the copy) — but that
    // left every duplicate with no photo at all until one of those flows ran
    // again, even though the copy visually IS the original at the moment of
    // copying. Carry over just the latest existing image as a starting point
    // (same underlying storage object, not re-uploaded) rather than leaving
    // an obviously-not-empty product showing the "no photo yet" placeholder.
    (async () => {
      const { data: latestVersion } = await supabase.from('design_versions').select('image_url').eq('product_id', id).neq('label', PSD_VERSION_LABEL).order('created_at', { ascending: false }).limit(1).maybeSingle();
      let imageUrl = latestVersion?.image_url || null;
      if (!imageUrl) {
        const { data: tp } = await supabase.from('tech_packs').select('image_url').eq('product_id', id).maybeSingle();
        imageUrl = tp?.image_url || null;
      }
      if (imageUrl) {
        await supabase.from('design_versions').insert([{
          product_id: newProduct.id, image_url: imageUrl, label: 'Copied from original', source: 'duplicate',
        }]);
      }
    })().catch(err => console.error('Failed to carry over duplicate image', err));

    setProducts(prev => [newProduct, ...prev]);
    return newProduct.id;
  };

  const setProductStatus = async (id, status) => {
    const { data, error } = await supabase.from('products').update({ status }).eq('id', id).select().single();
    if (error) throw error;

    if (status === 'archived') {
      setProducts(prev => prev.filter(p => p.id !== id));
      setArchivedProducts(prev => [data, ...prev.filter(p => p.id !== id)]);
    } else {
      setArchivedProducts(prev => prev.filter(p => p.id !== id));
      setProducts(prev => (prev.some(p => p.id === id) ? prev.map(p => (p.id === id ? data : p)) : [data, ...prev]));
    }
    return data;
  };

  const archiveProduct = (id) => setProductStatus(id, 'archived');

  const loadArchivedProducts = async () => {
    if (!activeBrand) return [];
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('brand_id', activeBrand.id)
      .eq('status', 'archived')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load archived products', error);
      setArchivedProducts([]);
      return [];
    }
    setArchivedProducts(data || []);
    return data || [];
  };

  const deleteCollection = async (id) => {
    const { error } = await supabase.from('collections').delete().eq('id', id);
    if (error) throw error;
    setCollections(prev => prev.filter(c => c.id !== id));
    setProducts(prev => prev.map(p => (p.collection_id === id ? { ...p, collection_id: null } : p)));
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

  const createDesign = async ({ garmentType, baseType, silhouette, colorway, file, collectionId, aiPaths, name }) => {
    if (!activeBrand) throw new Error("No active brand found");

    const { data: productData, error: prodError } = await supabase
      .from('products')
      .insert([{
        brand_id: activeBrand.id,
        name: (name && name.trim()) || `New ${garmentType}`,
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

    supabase.from('product_stage_history').insert([{ product_id: productData.id, stage: 'concept' }]).then(({ error: histErr }) => {
      if (histErr) console.error('Failed to log stage history', histErr);
    });

    if (file) {
      uploadedFiles.current.set(productData.id, file);
      // Persist the design's starting image immediately — previously nothing
      // wrote to storage until an explicit tech pack cover or AI Studio
      // "save as version" happened, so a freshly created design (upload or
      // AI silhouette) had no real photo anywhere and Home's featured card
      // fell back to the honest placeholder for what could be a long time.
      uploadDesignImage(file, productData.id, baseType === 'upload' ? 'upload' : 'silhouette')
        .then(url => supabase.from('design_versions').insert([{
          product_id: productData.id, image_url: url, label: 'Initial design', source: baseType,
        }]))
        .catch(err => console.error('Failed to persist initial design image', err));
    }

    setProducts(prev => [productData, ...prev]);
    setDesigns(prev => ({
      ...prev,
      [productData.id]: {
        garmentType, silhouette: silhouette || null, baseType, colorway: colorway || '—',
        status: 'Sketching',
        layers: [{ name: baseType === 'upload' ? 'Uploaded mockup' : 'Silhouette base', visible: true }],
        analysis: null,
        aiPaths: aiPaths || null,
        fabricTags: [],
      },
    }));

    return productData.id;
  };

  const getUploadedFile = id => uploadedFiles.current.get(id) || null;

  // --- PRODUCT MEDIA BIN / ASSETS ---
  const loadProductAssets = async (productId) => {
    const { data, error } = await supabase.from('product_assets').select('*').eq('product_id', productId).order('created_at', { ascending: false });
    if (!error) setProductAssets(prev => ({ ...prev, [productId]: data || [] }));
  };

  const uploadProductAsset = async (productId, file) => {
    if (!activeBrand) throw new Error("No active brand");
    const ext = file.name.split('.').pop();
    const fileName = `${productId}-asset-${Date.now()}.${ext}`;
    
    const { error: uploadError } = await supabase.storage.from('mockups').upload(fileName, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('mockups').getPublicUrl(fileName);

    const { data, error } = await supabase.from('product_assets').insert([{
      product_id: productId,
      brand_id: activeBrand.id,
      file_url: publicUrl,
      file_name: file.name,
      file_type: file.type
    }]).select().single();

    if (error) throw error;
    setProductAssets(prev => ({ ...prev, [productId]: [data, ...(prev[productId] || [])] }));
    return data;
  };

  const deleteProductAsset = async (asset) => {
    const fileName = asset.file_url.split('/').pop();
    await supabase.storage.from('mockups').remove([fileName]);
    const { error } = await supabase.from('product_assets').delete().eq('id', asset.id);
    if (error) throw error;
    setProductAssets(prev => ({ ...prev, [asset.product_id]: prev[asset.product_id].filter(a => a.id !== asset.id) }));
  };

  return (
    <ProductsContext.Provider value={{
      products, collections, moveProduct, updateProduct, deleteProduct, toggleFavorite, designs, createDesign, createCollection,
      deleteCollection, updateBrand, getUploadedFile, activeBrand, brands, switchBrand, createBrand,
      categories, createCategory, deleteCategory,
      archivedProducts, loadArchivedProducts, duplicateProduct, setProductStatus, archiveProduct,
      updateDesignStatus, updateDesignFabricTags,
      productAssets, loadProductAssets, uploadProductAsset, deleteProductAsset,
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