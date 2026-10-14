import React from 'react';
import AdminBannersSection from '@/components/admin/AdminBannersSection';
import AdminCouponsSection from '@/components/admin/AdminCouponsSection';
import AdminReviewsSection from '@/components/admin/AdminReviewsSection';

export default function AdminContentTab() {
  return (
    <div className="space-y-6">
      <AdminBannersSection />
      <AdminCouponsSection />
      <AdminReviewsSection />
    </div>
  );
}