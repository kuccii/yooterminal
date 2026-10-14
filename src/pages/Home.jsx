import React from 'react';
import Hero from '@/components/home/Hero';
import PromoBanners from '@/components/home/PromoBanners';
import TrustSection from '@/components/home/TrustSection';
import OperatorsSection from '@/components/home/OperatorsSection';
import TopRoutes from '@/components/home/TopRoutes';
import CountriesSection from '@/components/home/CountriesSection';
import WhySection from '@/components/home/WhySection';
import FaqSection from '@/components/home/FaqSection';

export default function Home() {
  return (
    <>
      <Hero />
      <PromoBanners />
      <TrustSection />
      <OperatorsSection />
      <TopRoutes />
      <CountriesSection />
      <WhySection />
      <FaqSection />
    </>
  );
}