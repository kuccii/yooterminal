import React from 'react';
import AdminBannersSection from '@/components/admin/AdminBannersSection';
import AdminCouponsSection from '@/components/admin/AdminCouponsSection';
import AdminFaqsSection from '@/components/admin/AdminFaqsSection';
import AdminFeaturesSection from '@/components/admin/AdminFeaturesSection';
import AdminReviewsSection from '@/components/admin/AdminReviewsSection';
import AdminSiteContentSection from '@/components/admin/AdminSiteContentSection';

export default function AdminContentTab() {
  return (
    <div className="space-y-6">
      <AdminSiteContentSection />
      <AdminFaqsSection />
      <AdminFeaturesSection />
      <AdminBannersSection />
      <AdminCouponsSection />
      <AdminReviewsSection />
    </div>
  );
}