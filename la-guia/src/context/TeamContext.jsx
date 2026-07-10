import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useProducts } from './ProductsContext.jsx';
import { useAuth } from './AuthContext.jsx';

const TeamContext = createContext(null);

export function TeamProvider({ children }) {
  const { activeBrand } = useProducts();
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMembers = async () => {
    if (!activeBrand) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('brand_members')
        .select('*')
        .eq('brand_id', activeBrand.id)
        .order('invited_at', { ascending: true });
      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error loading team members:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMembers(); }, [activeBrand?.id]);

  // Whenever the signed-in user changes, check for pending invites matching
  // their email and claim them — this is the whole "accept an invite" flow,
  // no transactional email required.
  useEffect(() => {
    if (!user?.email) return;
    async function claimInvites() {
      const { data: pending } = await supabase
        .from('brand_members')
        .select('id')
        .eq('invited_email', user.email)
        .is('user_id', null);
      if (!pending || pending.length === 0) return;
      await Promise.all(pending.map(row =>
        supabase.from('brand_members').update({ user_id: user.id, status: 'active', joined_at: new Date().toISOString() }).eq('id', row.id)
      ));
    }
    claimInvites();
  }, [user?.id]);

  const myRole = activeBrand?.memberRole || 'owner';
  const canManage = myRole === 'owner' || myRole === 'admin';

  const inviteMember = async (email, role) => {
    if (!activeBrand) throw new Error('No active brand');
    const { data, error } = await supabase
      .from('brand_members')
      .insert([{ brand_id: activeBrand.id, invited_email: email.trim().toLowerCase(), role }])
      .select()
      .single();
    if (error) throw error;
    setMembers(prev => [...prev, data]);
    return data;
  };

  const updateMemberRole = async (id, role) => {
    const { data, error } = await supabase.from('brand_members').update({ role }).eq('id', id).select().single();
    if (error) throw error;
    setMembers(prev => prev.map(m => (m.id === id ? data : m)));
    return data;
  };

  const removeMember = async (id) => {
    const { error } = await supabase.from('brand_members').delete().eq('id', id);
    if (error) throw error;
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  return (
    <TeamContext.Provider value={{ members, loading, myRole, canManage, inviteMember, updateMemberRole, removeMember, refresh: loadMembers }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used inside TeamProvider');
  return ctx;
}
