import db from '@/api/client';

import React, { useCallback, useEffect, useState } from 'react';

import Stars from '@/components/Stars';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function AdminReviewsSection() {
  const [reviews, setReviews] = useState([]);

  const load = useCallback(async () => {
    const page = await db.entities.Review.list({ sort: '-created_date', limit: 100 });
    setReviews(page.items || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (review, status) => {
    await db.entities.Review.update(review.id, { status });
    await load();
  };

  const remove = async (review) => {
    if (!window.confirm(`Delete the review by ${review.author_name}?`)) return;
    await db.entities.Review.delete(review.id);
    await load();
  };

  return (
    <Card className="rounded-3xl border-border p-6 shadow-sm">
      <h2 className="font-display text-lg font-bold">Customer reviews</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Hidden reviews stop appearing on operator profiles and in the home page rating straight away.
      </p>

      <div className="mt-5 space-y-3">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{review.author_name}</p>
                <p className="text-xs text-muted-foreground">
                  {review.operator_name} · {review.route_label}
                  {review.travel_date ? ` · ${review.travel_date}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Stars rating={review.rating} />
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    review.status === 'hidden' ? 'bg-muted text-muted-foreground' : 'bg-[hsl(var(--trust))] text-white'
                  }`}
                >
                  {review.status === 'hidden' ? 'hidden' : 'published'}
                </span>
              </div>
            </div>
            <Separator className="my-3" />
            <p className="text-sm text-muted-foreground">{review.comment}</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStatus(review, review.status === 'hidden' ? 'published' : 'hidden')}
              >
                {review.status === 'hidden' ? 'Publish' : 'Hide'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(review)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
        {!reviews.length && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
      </div>
    </Card>
  );
}