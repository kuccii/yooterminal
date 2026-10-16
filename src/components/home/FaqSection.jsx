import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useSiteContent } from '@/lib/SiteContentContext';

export default function FaqSection() {
  const { content, faqs } = useSiteContent();

  return (
    <section className="mx-auto max-w-3xl px-4 py-14">
      <h2 className="text-center font-display text-2xl font-extrabold tracking-tight">{content.faq_heading}</h2>
      <Accordion type="single" collapsible className="mt-8">
        {faqs.map((item, index) => (
          <AccordionItem key={`${item.question}-${index}`} value={`faq-${index}`} className="border-border">
            <AccordionTrigger className="text-left font-semibold hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
